import type { FeatureSource } from "../access.service.ts";
import { isDisplayLabel } from "../catalog.service.ts";
import type { FeatureConnection } from "../catalog.service.ts";
import type { ToolContext } from "../tools.ts";
import { NOT_FOUND, ToolError } from "../toolSupport.ts";
import { distanceBetween } from "./distance.ts";
import { DRAWN_ID } from "./drawn.ts";
import { DERIVED_ID, propertyHash } from "./featureIds.ts";
import type { StoredQuery } from "./featureResults.ts";
import { titleOf } from "./featureRows.ts";
import type { Feature, Geometry, Position } from "./geojson.ts";
import { representativePoint } from "./points.ts";
import type { WfsResult } from "./wfsClient.ts";
import { buildFilter, buildResourceIdFilter } from "./wfsQuery.ts";
import type { FeatureSort, GetFeatureOptions } from "./wfsQuery.ts";

// Same as `maxResultsPerDataset` in Search, and about 1 MB at most
export const MAX_FEATURES = 250;
const MAX_REQUESTS_PER_TURN = 20;

/** What the feature tools need of the tool context. */
export type Context = Pick<
  ToolContext,
  | "userCatalog"
  | "wfs"
  | "featureResults"
  | "signal"
  | "wfsRequests"
  | "wfsResponses"
  | "drawn"
>;

const DRAWN_NOT_SHARED =
  "That drawn feature isn't shared now. Only the drawn features in the latest map state can be used.";

/** A feature that matched. The distance is null without `near`. */
export interface Match {
  feature: Feature;
  distance: number | null;
}

export interface Prepared {
  connection: FeatureConnection;
  filter: string;
  /** Null if the query has no `near`. */
  anchor: Geometry | null;
}

/**
 * @summary The source of a query. The access rules, the opt-in list and the
 * store are all behind `featureSources`, so this is where access is decided, and
 * it runs on every use, as access can change during a conversation.
 */
export function querySource(
  id: string,
  { userCatalog }: Context
): FeatureSource {
  const source = userCatalog.featureSources.find((s) => s.id === id);
  if (source === undefined) {
    throw new ToolError(NOT_FOUND);
  }
  return source;
}

export async function connectionOf(
  source: FeatureSource,
  { userCatalog, wfs }: Context
): Promise<FeatureConnection> {
  const connection = await wfs.connectionOf(userCatalog.map, source.id);
  if (connection === undefined) {
    throw new ToolError(NOT_FOUND);
  }
  return connection;
}

/**
 * @summary A request, or its answer from earlier in the turn. Showing,
 * routing and `near` run searches again, which would otherwise use up the cap
 * on what the search itself already fetched.
 * @description The count is checked right before the request, as read tools
 * run in parallel. An answer is kept as a promise, so that parallel tools
 * share one request too, and dropped if it fails, so that it can be tried
 * again.
 */
export function request(
  connection: FeatureConnection,
  options: GetFeatureOptions,
  context: Context
): Promise<WfsResult> {
  const key = JSON.stringify([
    connection.url,
    connection.typeName,
    connection.srsName,
    options,
  ]);
  const earlier = context.wfsResponses.get(key);
  if (earlier !== undefined) {
    return earlier;
  }
  if (context.wfsRequests >= MAX_REQUESTS_PER_TURN) {
    throw new ToolError(
      "Too many searches for one question. Answer with what you have."
    );
  }
  context.wfsRequests += 1;
  const response = context.wfs.query(connection, options, context.signal);
  context.wfsResponses.set(key, response);
  response.catch(() => context.wfsResponses.delete(key));
  return response;
}

/** @summary Find a feature with a derived id by running its result again. */
async function derivedAnchorOf(
  resultId: string,
  hash: string,
  context: Context
): Promise<Geometry> {
  const query = context.featureResults.getResult(resultId);
  if (query === undefined) {
    throw new ToolError(NOT_FOUND);
  }
  const { matches } = await fetchMatches(
    query,
    await prepare(query, context),
    context
  );
  const match = matches.find(({ feature }) => propertyHash(feature) === hash);
  if (!match?.feature.geometry) {
    throw new ToolError(NOT_FOUND);
  }
  return match.feature.geometry;
}

/** @summary A drawn feature of this message. They need no access check. */
export function drawnGeometry(featureId: string, { drawn }: Context): Geometry {
  const feature = drawn.get(featureId);
  if (feature === undefined) {
    throw new ToolError(DRAWN_NOT_SHARED);
  }
  return feature.geometry;
}

async function anchorOf(
  featureId: string,
  context: Context
): Promise<Geometry> {
  if (DRAWN_ID.test(featureId)) {
    return drawnGeometry(featureId, context);
  }
  const derived = DERIVED_ID.exec(featureId);
  if (derived !== null) {
    return derivedAnchorOf(derived[1], derived[2], context);
  }
  const sourceId = context.featureResults.getSourceOf(featureId);
  if (sourceId === undefined) {
    throw new ToolError(NOT_FOUND);
  }
  const connection = await connectionOf(
    querySource(sourceId, context),
    context
  );
  const { features } = await request(
    connection,
    { filter: buildResourceIdFilter(featureId), sort: null, count: 1 },
    context
  );
  const geometry = features[0]?.geometry;
  if (!geometry) {
    throw new ToolError(NOT_FOUND);
  }
  return geometry;
}

/**
 * @summary One point for a feature from an earlier search, in the map
 * projection, under the same access rules as `near`. The search kept it, so it
 * usually costs no request, which matters when routing to many features.
 * @throws {ToolError} If it's unknown, out of reach or has no geometry
 */
export async function featurePoint(
  featureId: string,
  context: Context
): Promise<Position> {
  if (DRAWN_ID.test(featureId)) {
    return representativePoint(drawnGeometry(featureId, context));
  }
  const sourceId = context.featureResults.getSourceOf(featureId);
  const point = context.featureResults.getPoint(featureId);
  if (sourceId !== undefined && point !== undefined) {
    // Access can change during a conversation
    querySource(sourceId, context);
    return point;
  }
  return representativePoint(await anchorOf(featureId, context));
}

/**
 * @summary The whole geometry of a feature from an earlier search, or of a
 * drawn feature, in the map projection, under the same access rules as `near`.
 * @throws {ToolError} If it's unknown, out of reach or has no geometry
 */
export const featureGeometry = (
  featureId: string,
  context: Context
): Promise<Geometry> => anchorOf(featureId, context);

/**
 * @summary The features of an earlier search, with their geometry and title,
 * such as all the road works to avoid on a route.
 * @param max The most that may be used. A result with more is refused, as
 * leaving some out would give a wrong answer.
 * @throws {ToolError} If the result is unknown, out of reach or too large
 */
export async function resultGeometries(
  resultId: string,
  max: number,
  context: Context
): Promise<Array<{ geometry: Geometry; title: string }>> {
  const query = context.featureResults.getResult(resultId);
  if (query === undefined) {
    throw new ToolError(NOT_FOUND);
  }
  const prepared = await prepare(query, context);
  const { matches, total, tooMany } = await fetchMatches(
    query,
    prepared,
    context
  );
  if (tooMany || total > max || matches.length < total) {
    throw new ToolError(
      `The result has ${total} features, and at most ${max} can be used. Narrow the search.`
    );
  }
  return matches.flatMap(({ feature }) =>
    feature.geometry === null
      ? []
      : [
          {
            geometry: feature.geometry,
            title: titleOf(prepared.connection, feature.properties ?? {}),
          },
        ]
  );
}

export async function prepare(
  query: StoredQuery,
  context: Context
): Promise<Prepared> {
  const connection = await connectionOf(
    querySource(query.sourceId, context),
    context
  );
  const anchor =
    query.near === null
      ? null
      : (query.near.geometry ??
        (await anchorOf(query.near.featureId, context)));
  const filter = buildFilter(
    {
      text: query.text,
      filters: query.filters,
      // A sort puts empty values first, and they say nothing about the question
      hasValue: query.sort?.field ?? null,
      near:
        anchor === null || query.near === null
          ? null
          : { geometry: anchor, distance: query.near.distanceM },
    },
    connection
  );
  return { connection, filter, anchor };
}

function defaultSort({ displayFields }: FeatureConnection): FeatureSort | null {
  const field = displayFields.find((name) => !isDisplayLabel(name));
  return field === undefined ? null : { field, descending: false };
}

const byId = (a: Match, b: Match): number =>
  String(a.feature.id).localeCompare(String(b.feature.id));

const byDistance = (a: Match, b: Match): number =>
  (a.distance ?? Infinity) - (b.distance ?? Infinity) || byId(a, b);

function toMatch(feature: Feature, anchor: Geometry | null): Match {
  const distance =
    anchor === null || feature.geometry === null
      ? null
      : distanceBetween(anchor, feature.geometry);
  return { feature, distance };
}

/**
 * @summary Fetch all that can be reached of a query, always in the same order.
 * One fetch gives all pages: `startIndex` repeats rows when sort values tie.
 * @description Sorting by distance needs every match, as the nearest could be
 * among those left out, so it's refused when there are too many.
 */
export async function fetchMatches(
  query: StoredQuery,
  { connection, filter, anchor }: Prepared,
  context: Context
): Promise<{ matches: Match[]; total: number; tooMany: boolean }> {
  const sortByDistance = anchor !== null && query.sort === null;

  if (sortByDistance) {
    const { total } = await request(
      connection,
      { filter, sort: null, count: 0 },
      context
    );
    if (total > MAX_FEATURES) {
      return { matches: [], total, tooMany: true };
    }
  }

  const { features, total } = await request(
    connection,
    {
      filter,
      sort: sortByDistance ? null : (query.sort ?? defaultSort(connection)),
      count: MAX_FEATURES,
    },
    context
  );
  const matches = features.map((feature) => toMatch(feature, anchor));
  return {
    matches: sortByDistance ? matches.sort(byDistance) : matches,
    total,
    tooMany: false,
  };
}
