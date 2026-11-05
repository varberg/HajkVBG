import log4js from "log4js";

import type { CatalogRecord } from "../catalog.service.ts";

const logger = log4js.getLogger("service.ai.search");

// Well below the 8191 tokens of text-embedding-3-small, also for text that
// tokenizes badly. The longest layer today is about 2000 characters.
const MAX_TEXT_CHARS = 16_000;

/**
 * @summary The text that represents a layer in the vector index: its caption,
 * group path, owner, content tag and sublayer captions, followed by the
 * layer's text with the info of its groups.
 */
export function embeddingText(record: CatalogRecord): string {
  const subLayers = record.subLayers
    .map((sub) => sub.caption)
    .filter((caption) => caption !== null && caption !== record.caption);

  const text = [
    record.caption,
    record.groupPath.join(" > "),
    record.owner,
    record.contentTag,
    [...new Set(subLayers)].join(", "),
    record.text,
  ]
    .filter(Boolean)
    .join("\n");

  if (text.length > MAX_TEXT_CHARS) {
    logger.warn(
      `Text of layer "${record.id}" is too long to embed, cutting it off at ${MAX_TEXT_CHARS} characters.`
    );
    return text.slice(0, MAX_TEXT_CHARS);
  }
  return text;
}

function normalise(vector: Float32Array): Float32Array {
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((value) => value / length);
}

/**
 * @summary In-memory brute-force cosine search. At this scale a full scan takes
 * about a millisecond, so there is no need for a vector database.
 */
export class VectorIndex {
  #ids: string[];
  #dimensions: number;
  #matrix: Float32Array;

  constructor(entries: ReadonlyArray<{ id: string; vector: Float32Array }>) {
    this.#ids = entries.map((entry) => entry.id);
    this.#dimensions = entries[0]?.vector.length ?? 0;
    this.#matrix = new Float32Array(entries.length * this.#dimensions);

    entries.forEach(({ id, vector }, row) => {
      if (vector.length !== this.#dimensions) {
        throw new Error(`Vector of layer "${id}" has the wrong dimensions.`);
      }
      this.#matrix.set(normalise(vector), row * this.#dimensions);
    });
  }

  /**
   * @returns Layer ids, best match first. Layers that aren't allowed are left
   * out before the limit is applied.
   */
  search(
    query: Float32Array,
    limit: number,
    isAllowed: (id: string) => boolean
  ): string[] {
    if (this.#ids.length === 0) {
      return [];
    }
    if (query.length !== this.#dimensions) {
      throw new Error(
        `Query has ${query.length} dimensions, the index ${this.#dimensions}.`
      );
    }

    const unit = normalise(query);
    const scored: Array<{ id: string; score: number }> = [];

    this.#ids.forEach((id, row) => {
      if (!isAllowed(id)) {
        return;
      }
      const offset = row * this.#dimensions;
      let score = 0;
      for (let i = 0; i < this.#dimensions; i++) {
        score += this.#matrix[offset + i] * unit[i];
      }
      scored.push({ id, score });
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.id);
  }
}
