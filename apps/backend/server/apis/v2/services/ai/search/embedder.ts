import log4js from "log4js";

import { readEmbeddingConfig } from "../config.ts";
import type { EmbeddingConfig } from "../config.ts";

const logger = log4js.getLogger("service.ai.search");

export type EmbeddingInputType = "query" | "document";

/**
 * Independent of the chat provider, so that the chat can run on one vendor and
 * the embeddings on another.
 */
export interface Embedder {
  /** Provider and model. Vectors of different ids must never be mixed. */
  readonly id: string;
  /** The most texts the API takes in one request. */
  readonly maxBatchTexts: number;
  embed(
    texts: string[],
    inputType: EmbeddingInputType,
    signal: AbortSignal
  ): Promise<Float32Array[]>;
}

// OpenAI allows 300K tokens per request and voyage-4 320K. A token is at least
// about one character, so a limit in characters stays below both.
const MAX_BATCH_CHARS = 300_000;

/**
 * @summary Split texts into batches within an API's limits. A text that is
 * longer than the character limit gets a batch of its own.
 */
export function batchTexts(texts: string[], maxTexts: number): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let chars = 0;

  for (const text of texts) {
    if (
      batch.length > 0 &&
      (batch.length >= maxTexts || chars + text.length > MAX_BATCH_CHARS)
    ) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(text);
    chars += text.length;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}

function inInputOrder(
  data: Array<{ embedding: number[]; index: number }>,
  expected: number
): Float32Array[] {
  if (data.length !== expected) {
    throw new Error(`Expected ${expected} embeddings, got ${data.length}.`);
  }
  return [...data]
    .sort((a, b) => a.index - b.index)
    .map(({ embedding }) => Float32Array.from(embedding));
}

export interface OpenAiEmbeddingsClient {
  embeddings: {
    create(
      body: { model: string; input: string[] },
      options: { signal: AbortSignal; maxRetries?: number }
    ): Promise<{ data: Array<{ embedding: number[]; index: number }> }>;
  };
}

async function loadOpenAiClient(
  apiKey: string
): Promise<OpenAiEmbeddingsClient> {
  // Loaded here, so that installs with the chat disabled never load the package
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey });
}

/** @summary OpenAI embeddings. The SDK reads OPENAI_BASE_URL on its own. */
export function createOpenAiEmbedder(
  apiKey: string,
  model: string,
  loadClient = loadOpenAiClient
): Embedder {
  let client: Promise<OpenAiEmbeddingsClient> | null = null;

  return {
    id: `openai:${model}`,
    maxBatchTexts: 2048,
    async embed(texts, inputType, signal) {
      client ??= loadClient(apiKey);
      const { data } = await (
        await client
      ).embeddings.create(
        { model, input: texts },
        // A query has a short timeout and falls back to keyword search instead
        { signal, ...(inputType === "query" ? { maxRetries: 0 } : {}) }
      );
      return inInputOrder(data, texts.length);
    },
  };
}

/** @summary Voyage embeddings, through the REST API as there's no official SDK. */
export function createVoyageEmbedder(apiKey: string, model: string): Embedder {
  return {
    id: `voyage:${model}`,
    maxBatchTexts: 1000,
    async embed(texts, inputType, signal) {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        // Cutting texts off is our decision, see embeddingText()
        body: JSON.stringify({
          model,
          input: texts,
          input_type: inputType,
          truncation: false,
        }),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Voyage responded with status ${response.status}.`);
      }
      const { data } = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };
      return inInputOrder(data, texts.length);
    },
  };
}

/**
 * @summary Create the embedder chosen in .env.
 * @returns The embedder, or null if it isn't configured. The chat then runs on
 * keyword search only, so this must never stop the backend.
 */
export function createEmbedder(
  config: EmbeddingConfig = readEmbeddingConfig()
): Embedder | null {
  const { provider, model, apiKey } = config;
  if (provider !== "openai" && provider !== "voyage") {
    logger.warn(
      `Unknown AI_EMBEDDING_PROVIDER "${provider}", using keyword search only.`
    );
    return null;
  }
  if (apiKey === undefined) {
    logger.warn(`No API key for "${provider}", using keyword search only.`);
    return null;
  }

  return provider === "openai"
    ? createOpenAiEmbedder(apiKey, model)
    : createVoyageEmbedder(apiKey, model);
}
