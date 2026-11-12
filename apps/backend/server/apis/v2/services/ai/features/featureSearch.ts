import { createHash } from "node:crypto";

import type { FeatureSource } from "../access.service.ts";
import { isDisplayLabel } from "../catalog.service.ts";
import type { FeatureConnection } from "../catalog.service.ts";
import type { ToolContext, ToolEvent } from "../tools.ts";
import { NOT_FOUND, PAGE_SIZE, ToolError, readOffset } from "../toolSupport.ts";
import { distanceBetween } from "./distance.ts";
import { DRAWN_ID } from "./drawn.ts";
import { featureLinks } from "./featureLinks.ts";
import { isAddressable } from "./featureResults.ts";
import type { StoredQuery } from "./featureResults.ts";
import type { Feature, Geometry, Position } from "./geojson.ts";
import { representativePoint } from "./points.ts";
import type { WfsResult } from "./wfsClient.ts";
import { buildFilter, buildResourceIdFilter } from "./wfsQuery.ts";
import type {
  FeatureSort,
  FieldFilter,
  GetFeatureOptions,
} from "./wfsQuery.ts";

// Same as `maxResultsPerDataset` in Search, and about 1 MB at most
const MAX_FEATURES = 250;
const MAX_REQUESTS_PER_TURN = 20;
const MAX_VALUE_LENGTH = 300;

const TOO_MANY_TO_SHOW = "Too many matches to show, narrow the search.";

/** The id of a feature that has no stable one, see `idOf`. */
const DERIVED_ID = /^(r\d+)~([0-9a-f]{16})$/;

type Context = Pick<
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

export interface SearchInput {
  source_id: string;
  text: string | null;
  filters: FieldFilter[] | null;
  near: { feature_id: string; distance_m: number } | null;
  sort: FeatureSort | null;
  count_only: boolean;
  offset: number;
}

export interface ShowInput {
  result_ids: string[];
  feature_ids: string[] | null;
}

interface Rejection {
  id: string;
  reason: string;
}

/** A feature that matched. The distance is null without `near`. */
interface Match {
  feature: Feature;
  distance: number | null;
}

interface Prepared {
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
function querySource(id: string, { userCatalog }: Context): FeatureSource {
  const source = userCatalog.featureSources.find((s) => s.id === id);
  if (source === undefined) {
    throw new ToolError(NOT_FOUND);
  }
  return source;
}

async function connectionOf(
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
function request(
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

/** @summary Properties are the same in every response, unlike a `fid-` id. */
const propertyHash = ({ properties }: Feature): string =>
  createHash("sha256")
    .update(JSON.stringify(properties ?? {}))
    .digest("hex")
    .slice(0, 16);

/**
 * @summary The id the model sees. A source without a primary key, such as a
 * view, gives ids that change with every request, so such a feature gets one
 * from the result that found it and its properties. Features that only differ
 * in their geometry then share an id.
 */
function idOf(feature: Feature, resultId: string): string {
  const { id } = feature;
  return id !== undefined && isAddressable(String(id))
    ? String(id)
    : `${resultId}~${propertyHash(feature)}`;
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
function drawnGeometry(featureId: string, { drawn }: Context): Geometry {
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

async function prepare(
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
async function fetchMatches(
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

/** @returns The value as the model may see it, or undefined if it's empty */
function readable(value: unknown): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  const text = value === null || value === undefined ? "" : String(value);
  return text.trim().slice(0, MAX_VALUE_LENGTH) || undefined;
}

/** @summary The title Search shows, which can be empty for a feature without. */
function titleOf(
  { displayFields }: FeatureConnection,
  properties: Record<string, unknown>
): string {
  return displayFields
    .map((field) =>
      isDisplayLabel(field)
        ? field.replaceAll('"', "")
        : readable(properties[field])
    )
    .filter((value) => value !== undefined)
    .join(" | ");
}

/**
 * @summary A feature as the model sees it: allowed fields, the links of its
 * infobox, and no geometry.
 */
function toRow(
  { feature, distance }: Match,
  resultId: string,
  source: FeatureSource,
  connection: FeatureConnection
) {
  const properties = feature.properties ?? {};
  const fields = Object.fromEntries(
    source.fields.flatMap((field) => {
      const value = readable(properties[field]);
      return value === undefined ? [] : [[field, value]];
    })
  );
  const links = featureLinks(connection.infobox, properties, source.fields);
  return {
    id: idOf(feature, resultId),
    title: titleOf(connection, properties),
    geometryType: feature.geometry?.type ?? null,
    fields,
    ...(links.length > 0 && { links }),
    ...(distance !== null &&
      Number.isFinite(distance) && { distanceM: Math.round(distance) }),
  };
}

function checkFields(fields: string[], source: FeatureSource): void {
  for (const field of fields) {
    if (!source.fields.includes(field)) {
      throw new ToolError(`The source has no field "${field}" to use.`);
    }
  }
}

export async function searchFeatures(input: SearchInput, context: Context) {
  const { source_id: sourceId, near, sort, count_only: countOnly } = input;
  const filters = input.filters ?? [];
  const start = readOffset(input.offset);
  const source = querySource(sourceId, context);

  checkFields(
    [...filters.map(({ field }) => field), ...(sort ? [sort.field] : [])],
    source
  );
  if (near !== null && near.distance_m < 0) {
    throw new ToolError("distance_m can't be negative.");
  }

  const query: StoredQuery = {
    sourceId,
    text: input.text?.trim() || null,
    filters,
    near:
      near === null
        ? null
        : {
            featureId: near.feature_id,
            distanceM: near.distance_m,
            ...(DRAWN_ID.test(near.feature_id) && {
              geometry: drawnGeometry(near.feature_id, context),
            }),
          },
    // A count isn't about the order, and shouldn't leave out empty values
    sort: countOnly ? null : sort,
  };
  const prepared = await prepare(query, context);
  const { featureResults } = context;

  if (countOnly) {
    const { connection, filter } = prepared;
    const { total } = await request(
      connection,
      { filter, sort: null, count: 0 },
      context
    );
    return {
      resultId: featureResults.addResult(query),
      source: source.caption,
      total,
    };
  }

  const { matches, total, tooMany } = await fetchMatches(
    query,
    prepared,
    context
  );
  if (tooMany) {
    return { source: source.caption, total, tooMany, features: [] };
  }

  const resultId = featureResults.addResult(query);
  const shown = matches.slice(start, start + PAGE_SIZE);
  for (const { feature } of shown) {
    if (feature.id !== undefined) {
      featureResults.addFeature(
        String(feature.id),
        sourceId,
        feature.geometry === null ? null : representativePoint(feature.geometry)
      );
    }
  }
  return {
    resultId,
    source: source.caption,
    total,
    reachable: matches.length,
    truncated: start + shown.length < total,
    offset: start,
    features: shown.map((match) =>
      toRow(match, resultId, source, prepared.connection)
    ),
  };
}

/**
 * @summary Run stored searches again, and send what they find to the browser.
 * The geometry goes there, and never to the model. A result that fails doesn't
 * stop the others, as the model can tell the user which one is missing.
 */
export async function showFeatures(
  { result_ids: resultIds, feature_ids: featureIds }: ShowInput,
  context: Context
) {
  const rejected: Rejection[] = [];
  const wanted = featureIds === null ? null : new Set(featureIds);
  const found = new Set<string>();
  const bySource = new Map<
    string,
    { connection: FeatureConnection; features: Map<string, Feature> }
  >();
  // Results can overlap, so what they found is counted once, after the loop
  let leftOut = 0;

  for (const id of new Set(resultIds)) {
    try {
      const query = context.featureResults.getResult(id);
      if (query === undefined) {
        throw new ToolError(NOT_FOUND);
      }
      const prepared = await prepare(query, context);
      const { matches, total, tooMany } = await fetchMatches(
        query,
        prepared,
        context
      );
      if (tooMany) {
        throw new ToolError(TOO_MANY_TO_SHOW);
      }

      const { connection } = prepared;
      const { features } = bySource.get(query.sourceId) ?? {
        features: new Map<string, Feature>(),
      };
      bySource.set(query.sourceId, { connection, features });
      for (const { feature } of matches) {
        const featureId = idOf(feature, id);
        if (wanted === null || wanted.has(featureId)) {
          found.add(featureId);
          // A derived id differs between results, but the feature doesn't
          const key = DERIVED_ID.test(featureId)
            ? `~${propertyHash(feature)}`
            : featureId;
          features.set(key, feature);
        }
      }
      leftOut += wanted === null ? total - matches.length : 0;
    } catch (error) {
      if (!(error instanceof ToolError)) {
        throw error;
      }
      rejected.push({ id, reason: error.message });
    }
  }

  for (const id of wanted ?? []) {
    if (!found.has(id)) {
      rejected.push({ id, reason: NOT_FOUND });
    }
  }

  let room = MAX_FEATURES;
  const collections = [...bySource].flatMap(([id, source]) => {
    const { connection, features } = source;
    const kept = [...features.values()].slice(0, room);
    room -= kept.length;
    return kept.length === 0
      ? []
      : [
          {
            source: {
              id,
              caption: connection.caption,
              displayFields: connection.displayFields,
              infobox: connection.infobox,
            },
            featureCollection: {
              type: "FeatureCollection" as const,
              features: kept,
            },
          },
        ];
  });
  const shown = MAX_FEATURES - room;
  const total =
    [...bySource.values()].reduce(
      (sum, { features }) => sum + features.size,
      0
    ) + leftOut;

  const events: ToolEvent[] =
    shown > 0 ? [{ type: "action", action: "show_features", collections }] : [];
  return {
    result: { shown, total, truncated: shown < total, rejected },
    events,
  };
}
