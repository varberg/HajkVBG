import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { buildCatalog } from "../../server/apis/v2/services/ai/catalog.service.ts";
import {
  VectorIndex,
  embeddingText,
} from "../../server/apis/v2/services/ai/search/vectorIndex.ts";
import {
  VectorCache,
  vectorKey,
} from "../../server/apis/v2/services/ai/search/vectorCache.ts";
import { layersStore, mapConfig } from "./fixtures.ts";

const vector = (...values: number[]) => Float32Array.from(values);
const all = () => true;

describe("VectorIndex", () => {
  const entries = [
    { id: "x", vector: vector(1, 0) },
    { id: "y", vector: vector(0, 5) }, // Length must not affect the ranking
    { id: "xy", vector: vector(1, 1) },
  ];

  test("ranks by cosine similarity", () => {
    const index = new VectorIndex(entries);
    assert.deepEqual(index.search(vector(0, 1), 3, all), ["y", "xy", "x"]);
  });

  test("leaves out layers before the limit is applied", () => {
    const index = new VectorIndex(entries);
    assert.deepEqual(
      index.search(vector(0, 1), 1, (id) => id !== "y"),
      ["xy"]
    );
  });

  test("handles an empty index and all-zero vectors", () => {
    assert.deepEqual(new VectorIndex([]).search(vector(1), 5, all), []);
    const index = new VectorIndex([{ id: "zero", vector: vector(0, 0) }]);
    assert.deepEqual(index.search(vector(0, 0), 5, all), ["zero"]);
  });

  test("refuses vectors of the wrong dimensions", () => {
    assert.throws(
      () => new VectorIndex([...entries, { id: "z", vector: vector(1) }]),
      /wrong dimensions/
    );
    assert.throws(
      () => new VectorIndex(entries).search(vector(1, 2, 3), 1, all),
      /dimensions/
    );
  });
});

describe("embeddingText", () => {
  const catalog = buildCatalog("demo", mapConfig(), layersStore());

  test("holds caption, group path, owner, tag and text", () => {
    const text = embeddingText(catalog.recordsById.get("plain")!);
    for (const part of [
      "Plangräns",
      "Planering",
      "Stadsbyggnad",
      "plan",
      "Första raden",
      "Om planering",
    ]) {
      assert.ok(text.includes(part), part);
    }
  });

  test("holds sublayer captions, and skips the empty ones", () => {
    const text = embeddingText(catalog.recordsById.get("group")!);
    assert.ok(text.includes("Sublager A"));
    assert.ok(!text.includes("null"));
  });

  test("never holds the url", () => {
    for (const record of catalog.records) {
      assert.ok(!embeddingText(record).includes("secret.example.com"));
    }
  });

  test("cuts off a text over the limit", () => {
    const record = catalog.recordsById.get("plain")!;
    const text = embeddingText({ ...record, text: "x".repeat(20_000) });
    assert.equal(text.length, 16_000);
  });
});

describe("VectorCache", () => {
  let dir: string;
  let file: string;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-vectors-"));
    file = path.join(dir, "nested", "demo.vectors.json");
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("a key depends on both the text and the model", () => {
    const key = vectorKey("openai:a", "text");
    assert.equal(key, vectorKey("openai:a", "text"));
    assert.notEqual(key, vectorKey("openai:b", "text"));
    assert.notEqual(key, vectorKey("openai:a", "other"));
  });

  test("keeps vectors exactly over a save and a load", async () => {
    const cache = await VectorCache.load(file);
    cache.set("a", vector(0.1, -0.2, 3e-7));
    await cache.save();

    const loaded = await VectorCache.load(file);
    assert.deepEqual(loaded.get("a"), vector(0.1, -0.2, 3e-7));
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["demo.vectors.json"]);
  });

  test("retainOnly drops everything else, also from the file", async () => {
    const cache = await VectorCache.load(file);
    cache.set("b", vector(1));
    cache.set("c", vector(2));
    cache.retainOnly(new Set(["c"]));
    await cache.save();

    const loaded = await VectorCache.load(file);
    assert.equal(loaded.get("a"), undefined);
    assert.equal(loaded.get("b"), undefined);
    assert.deepEqual(loaded.get("c"), vector(2));
  });

  test("a broken file counts as an empty cache", async () => {
    const broken = path.join(dir, "broken.vectors.json");
    fs.writeFileSync(broken, '{"version":1,"vec');
    const cache = await VectorCache.load(broken);
    assert.equal(cache.get("a"), undefined);
  });

  test("skips a broken entry, and a file of another format", async () => {
    const odd = path.join(dir, "odd.vectors.json");
    fs.writeFileSync(
      odd,
      JSON.stringify({ version: 1, vectors: { a: "AAA", b: 1, c: "AACAPw==" } })
    );
    const cache = await VectorCache.load(odd);
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b"), undefined);
    assert.deepEqual(cache.get("c"), vector(1));

    fs.writeFileSync(
      odd,
      JSON.stringify({ version: 0, vectors: { c: "AACAPw==" } })
    );
    assert.equal((await VectorCache.load(odd)).get("c"), undefined);
  });

  test("a failed save is not fatal", async () => {
    const blocker = path.join(dir, "file");
    fs.writeFileSync(blocker, "");
    const cache = await VectorCache.load(path.join(blocker, "a.json"));
    cache.set("a", vector(1));
    await cache.save();
    assert.deepEqual(cache.get("a"), vector(1));
  });
});
