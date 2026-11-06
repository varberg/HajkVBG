import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  FeatureResultStore,
  isAddressable,
} from "../../server/apis/v2/services/ai/features/featureResults.ts";
import type { StoredQuery } from "../../server/apis/v2/services/ai/features/featureResults.ts";

const query = (text: string | null = "a"): StoredQuery => ({
  sourceId: "adress",
  text,
  filters: [],
  near: null,
  sort: null,
});

describe("FeatureResultStore", () => {
  test("gives a query back by its id", () => {
    const store = new FeatureResultStore();
    const id = store.addResult(query("Kungsgatan"));
    assert.deepEqual(store.getResult(id), query("Kungsgatan"));
  });

  test("doesn't know ids it never gave out", () => {
    const store = new FeatureResultStore();
    assert.equal(store.getResult("r1"), undefined);
    assert.equal(store.getSourceOf("adress.1"), undefined);
  });

  test("gives different queries different ids", () => {
    const store = new FeatureResultStore();
    assert.notEqual(store.addResult(query("a")), store.addResult(query("b")));
  });

  test("gives the same query the same id, so pages share a result", () => {
    const store = new FeatureResultStore();
    assert.equal(store.addResult(query()), store.addResult(query()));
  });

  test("holds at most 50 results, and drops the oldest", () => {
    const store = new FeatureResultStore();
    const ids = Array.from({ length: 51 }, (_, i) =>
      store.addResult(query(`q${i}`))
    );
    assert.equal(store.getResult(ids[0]), undefined);
    assert.deepEqual(store.getResult(ids[1]), query("q1"));
    assert.deepEqual(store.getResult(ids[50]), query("q50"));
  });

  test("never hands out a dropped id again", () => {
    const store = new FeatureResultStore();
    const first = store.addResult(query("q0"));
    for (let i = 1; i <= 50; i++) {
      store.addResult(query(`q${i}`));
    }
    const again = store.addResult(query("q0"));
    assert.notEqual(again, first);
    assert.equal(store.getResult(first), undefined);
    assert.deepEqual(store.getResult(again), query("q0"));
  });

  test("remembers which source a feature came from", () => {
    const store = new FeatureResultStore();
    store.addFeature("adress.1", "1251");
    assert.equal(store.getSourceOf("adress.1"), "1251");
  });

  test("holds at most 1000 feature ids, and drops the oldest", () => {
    const store = new FeatureResultStore();
    for (let i = 0; i <= 1000; i++) {
      store.addFeature(`adress.${i}`, "1251");
    }
    assert.equal(store.getSourceOf("adress.0"), undefined);
    assert.equal(store.getSourceOf("adress.1"), "1251");
    assert.equal(store.getSourceOf("adress.1000"), "1251");
  });

  test("keeps a feature that is found again", () => {
    const store = new FeatureResultStore();
    store.addFeature("adress.0", "1251");
    for (let i = 1; i < 1000; i++) {
      store.addFeature(`adress.${i}`, "1251");
    }
    store.addFeature("adress.0", "1251");
    store.addFeature("adress.1000", "1251");
    assert.equal(store.getSourceOf("adress.0"), "1251");
    assert.equal(store.getSourceOf("adress.1"), undefined);
  });

  test("doesn't store ids that change with every request", () => {
    const store = new FeatureResultStore();
    store.addFeature("fid-5a3c_18f", "1806");
    assert.equal(store.getSourceOf("fid-5a3c_18f"), undefined);
  });
});

describe("isAddressable", () => {
  test("accepts stable ids", () => {
    assert.equal(isAddressable("adresspunkt.17986230"), true);
  });

  test("rejects fid- ids", () => {
    assert.equal(isAddressable("fid-5a3c_18f"), false);
    assert.equal(isAddressable("fastighet_vw.fid-5a0bb08_1a1_64c6"), false);
    assert.equal(isAddressable("adresspunkt.17985749"), true);
  });
});
