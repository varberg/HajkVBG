import type { Geometry, Position } from "./geojson.ts";
import type { FieldFilter, FeatureSort } from "./wfsQuery.ts";

const MAX_RESULTS = 50;
const MAX_FEATURE_IDS = 1000;

/** Ids like this change with every request, with or without the type in front. */
const UNSTABLE_ID = /^(.*\.)?fid-/;

/**
 * A search, as the model asked for it. Holds no features, and no geometry
 * except a drawn feature in `near`, which is kept as it was when searched. A
 * drawing only lives for one message, and the result must still mean the same
 * when it's shown later.
 */
export interface StoredQuery {
  sourceId: string;
  text: string | null;
  filters: FieldFilter[];
  near: { featureId: string; distanceM: number; geometry?: Geometry } | null;
  sort: FeatureSort | null;
}

export const isAddressable = (featureId: string): boolean =>
  !UNSTABLE_ID.test(featureId);

// A Map keeps its order, so the first key is always the oldest
function addCapped<T>(map: Map<string, T>, key: string, value: T, max: number) {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) {
    map.delete(map.keys().next().value as string);
  }
}

/**
 * @summary What a conversation has found so far, so that the model can refer to
 * it by id. Results are queries that get run again, and features are only ids,
 * which keeps this small however many conversations are live.
 */
export class FeatureResultStore {
  #results = new Map<string, StoredQuery>();
  #resultIds = new Map<string, string>();
  #sources = new Map<string, string>();
  /** One point per feature, so that routing needs no request of its own. */
  #points = new Map<string, Position>();
  #nextResult = 1;

  /** @returns The id of the result. The same query always gets the same id. */
  addResult(query: StoredQuery): string {
    const key = JSON.stringify(query);
    const known = this.#resultIds.get(key);
    if (known !== undefined && this.#results.has(known)) {
      return known;
    }
    const id = `r${this.#nextResult++}`;
    addCapped(this.#results, id, query, MAX_RESULTS);
    addCapped(this.#resultIds, key, id, MAX_RESULTS);
    return id;
  }

  getResult(id: string): StoredQuery | undefined {
    return this.#results.get(id);
  }

  /** @param point In the map projection, see representativePoint */
  addFeature(
    featureId: string,
    sourceId: string,
    point: Position | null = null
  ): void {
    if (isAddressable(featureId)) {
      addCapped(this.#sources, featureId, sourceId, MAX_FEATURE_IDS);
      if (point !== null) {
        addCapped(this.#points, featureId, point, MAX_FEATURE_IDS);
      }
    }
  }

  getPoint(featureId: string): Position | undefined {
    return this.#points.get(featureId);
  }

  /** @returns The source of a feature, which can have lost its access since. */
  getSourceOf(featureId: string): string | undefined {
    return this.#sources.get(featureId);
  }
}
