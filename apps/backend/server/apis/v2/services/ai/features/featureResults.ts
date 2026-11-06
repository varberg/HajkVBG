import type { FieldFilter, FeatureSort } from "./wfsQuery.ts";

const MAX_RESULTS = 50;
const MAX_FEATURE_IDS = 1000;

/** Ids like this change with every request, with or without the type in front. */
const UNSTABLE_ID = /^(.*\.)?fid-/;

/** A search, as the model asked for it. Holds no geometry and no features. */
export interface StoredQuery {
  sourceId: string;
  text: string | null;
  filters: FieldFilter[];
  near: { featureId: string; distanceM: number } | null;
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

  addFeature(featureId: string, sourceId: string): void {
    if (isAddressable(featureId)) {
      addCapped(this.#sources, featureId, sourceId, MAX_FEATURE_IDS);
    }
  }

  /** @returns The source of a feature, which can have lost its access since. */
  getSourceOf(featureId: string): string | undefined {
    return this.#sources.get(featureId);
  }
}
