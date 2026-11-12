import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { readEmbeddingConfig } from "../../server/apis/v2/services/ai/config.ts";
import {
  batchTexts,
  createEmbedder,
  createOpenAiEmbedder,
  createVoyageEmbedder,
} from "../../server/apis/v2/services/ai/search/embedder.ts";
import type { OpenAiEmbeddingsClient } from "../../server/apis/v2/services/ai/search/embedder.ts";

const signal = new AbortController().signal;

describe("batchTexts", () => {
  test("stays within the number of texts", () => {
    const batches = batchTexts(["a", "b", "c", "d", "e"], 2);
    assert.deepEqual(batches, [["a", "b"], ["c", "d"], ["e"]]);
  });

  test("stays within the size of a request", () => {
    const text = "x".repeat(200_000);
    assert.equal(batchTexts([text, text, text], 1000).length, 3);
  });

  test("gives a text over the limit its own batch", () => {
    const huge = "x".repeat(400_000);
    assert.deepEqual(
      batchTexts(["a", huge, "b"], 1000).map((b) => b.length),
      [1, 1, 1]
    );
  });

  test("gives no batches for no texts", () => {
    assert.deepEqual(batchTexts([], 10), []);
  });
});

describe("OpenAI embedder", () => {
  const embedderWith = (
    create: OpenAiEmbeddingsClient["embeddings"]["create"]
  ) =>
    createOpenAiEmbedder("key", "model-a", async () => ({
      embeddings: { create },
    }));

  test("returns vectors in the order of the input", async () => {
    const embedder = embedderWith(async () => ({
      data: [
        { index: 1, embedding: [2] },
        { index: 0, embedding: [1] },
      ],
    }));
    const vectors = await embedder.embed(["a", "b"], "document", signal);
    assert.deepEqual(vectors, [Float32Array.from([1]), Float32Array.from([2])]);
  });

  test("doesn't retry a query, but leaves retries on for documents", async () => {
    const options: object[] = [];
    const embedder = embedderWith(async (_body, opts) => {
      options.push(opts);
      return { data: [{ index: 0, embedding: [1] }] };
    });
    await embedder.embed(["a"], "query", signal);
    await embedder.embed(["a"], "document", signal);
    assert.deepEqual(options, [{ signal, maxRetries: 0 }, { signal }]);
  });

  test("refuses an answer with too few vectors", async () => {
    const embedder = embedderWith(async () => ({ data: [] }));
    await assert.rejects(embedder.embed(["a"], "query", signal), /Expected 1/);
  });

  test("has an id with provider and model", () => {
    assert.equal(embedderWith(async () => ({ data: [] })).id, "openai:model-a");
  });
});

describe("Voyage embedder", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const mockFetch = (status: number, body: object) => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return requests;
  };

  test("sends input_type, for both documents and queries", async () => {
    const requests = mockFetch(200, {
      data: [{ index: 0, embedding: [1, 2] }],
    });
    const embedder = createVoyageEmbedder("key", "voyage-4");

    await embedder.embed(["a"], "document", signal);
    const vectors = await embedder.embed(["a"], "query", signal);

    const bodies = requests.map((r) => JSON.parse(r.init.body as string));
    assert.deepEqual(
      bodies.map((b) => b.input_type),
      ["document", "query"]
    );
    assert.equal(bodies[0].model, "voyage-4");
    assert.deepEqual(bodies[0].input, ["a"]);
    assert.equal(
      (requests[0].init.headers as Record<string, string>).Authorization,
      "Bearer key"
    );
    assert.equal(requests[0].init.signal, signal);
    assert.deepEqual(vectors, [Float32Array.from([1, 2])]);
  });

  test("reports a failed request by its status", async () => {
    mockFetch(429, { detail: "slow down" });
    await assert.rejects(
      createVoyageEmbedder("key", "voyage-4").embed(["a"], "query", signal),
      /status 429/
    );
  });
});

describe("createEmbedder", () => {
  test("defaults to OpenAI text-embedding-3-small", () => {
    const embedder = createEmbedder(
      readEmbeddingConfig({ OPENAI_API_KEY: "key" })
    );
    assert.equal(embedder?.id, "openai:text-embedding-3-small");
  });

  test("picks Voyage, with voyage-4 as its default model", () => {
    const embedder = createEmbedder(
      readEmbeddingConfig({
        AI_EMBEDDING_PROVIDER: "voyage",
        VOYAGE_API_KEY: "key",
      })
    );
    assert.equal(embedder?.id, "voyage:voyage-4");
    assert.equal(embedder?.maxBatchTexts, 1000);
  });

  test("the model comes from AI_EMBEDDING_MODEL", () => {
    const embedder = createEmbedder(
      readEmbeddingConfig({
        OPENAI_API_KEY: "key",
        AI_EMBEDDING_MODEL: "other",
      })
    );
    assert.equal(embedder?.id, "openai:other");
  });

  test("a missing key or unknown provider gives no embedder", () => {
    assert.equal(createEmbedder(readEmbeddingConfig({})), null);
    assert.equal(
      createEmbedder(
        readEmbeddingConfig({
          AI_EMBEDDING_PROVIDER: "voyage",
          OPENAI_API_KEY: "key",
        })
      ),
      null
    );
    assert.equal(
      createEmbedder(
        readEmbeddingConfig({
          AI_EMBEDDING_PROVIDER: "x",
          OPENAI_API_KEY: "key",
        })
      ),
      null
    );
  });
});
