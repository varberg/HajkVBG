import type { FeatureSource } from "../access.service.ts";
import type { FeatureConnection } from "../catalog.service.ts";
import { NOT_FOUND, PAGE_SIZE, ToolError, readOffset } from "../toolSupport.ts";
import type { Rejection } from "../toolSupport.ts";
import type { ToolEvent } from "../tools.ts";
import {
  MAX_FEATURES,
  drawnGeometry,
  fetchMatches,
  prepare,
  querySource,
  request,
} from "./featureFetch.ts";
import type { Context } from "./featureFetch.ts";
import { DRAWN_ID } from "./drawn.ts";
import { DERIVED_ID, idOf, propertyHash } from "./featureIds.ts";
import type { StoredQuery } from "./featureResults.ts";
import { toRow } from "./featureRows.ts";
import type { Feature } from "./geojson.ts";
import { representativePoint } from "./points.ts";
import type { FieldFilter, FeatureSort } from "./wfsQuery.ts";

// The routing modules use these through here
export {
  featureGeometry,
  featurePoint,
  resultGeometries,
} from "./featureFetch.ts";

const TOO_MANY_TO_SHOW = "Too many matches to show, narrow the search.";

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
