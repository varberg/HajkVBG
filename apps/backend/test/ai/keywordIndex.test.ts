import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildCatalog } from "../../server/apis/v2/services/ai/catalog.service.ts";
import {
  buildKeywordIndex,
  withoutStopWords,
} from "../../server/apis/v2/services/ai/search/keywordIndex.ts";
import { layersStore, mapConfig, wmsLayer } from "./fixtures.ts";

const everyone = { isAllowed: () => true, ownView: new Set<string>() };

const storeWith = (...layers: object[]) => {
  const store = layersStore();
  store.wmslayers.push(...(layers as typeof store.wmslayers));
  return store;
};

const configWith = (...ids: string[]) => {
  const config = mapConfig();
  config.tools[0].options!.groups![0].layers!.push(
    ...ids.map((id) => ({ id }))
  );
  return config;
};

const index = (...layers: Array<{ id: string }>) =>
  buildKeywordIndex(
    buildCatalog(
      "demo",
      configWith(...layers.map((l) => l.id)),
      storeWith(...layers)
    )
  );

describe("withoutStopWords", () => {
  test("keeps the words that carry meaning", () => {
    assert.equal(withoutStopWords("Var finns det hundbad?"), "hundbad");
  });

  test("keeps the query if nothing else would remain", () => {
    assert.equal(withoutStopWords("Vad är det?"), "vad är det");
  });
});

describe("keyword index", () => {
  test("can require every word of the query", async () => {
    const keyword = await index(
      wmsLayer("both", { caption: "Cykelparkering hamnen" }),
      wmsLayer("one", { caption: "Cykelparkering" })
    );
    const query = "cykelparkering hamnen";
    assert.equal(keyword.search(query, 5, everyone).length, 2);
    assert.deepEqual(keyword.search(query, 5, everyone, "all"), ["both"]);
  });

  test("a question word doesn't match as the start of another word", async () => {
    const keyword = await index(
      wmsLayer("place", { caption: "Varberg direkt" }),
      wmsLayer("dogs", { caption: "Hundbadplatser" })
    );
    assert.deepEqual(keyword.search("Var finns hundbad?", 5, everyone), [
      "dogs",
    ]);
  });

  test("finds a layer by the start of a word", async () => {
    const keyword = await index(
      wmsLayer("flood", { caption: "Översvämningskartering" })
    );
    assert.equal(keyword.search("översvämning", 5, everyone)[0], "flood");
  });

  test("finds a layer despite a typo", async () => {
    const keyword = await index(
      wmsLayer("flood", { caption: "Översvämningskartering" })
    );
    assert.equal(
      keyword.search("översvämningskartring", 5, everyone)[0],
      "flood"
    );
  });

  test("a match in the caption beats a match in the text", async () => {
    const keyword = await index(
      wmsLayer("inText", { caption: "Annat", infoText: "Om badplatser" }),
      wmsLayer("inCaption", { caption: "Badplatser" })
    );
    assert.deepEqual(keyword.search("badplatser", 5, everyone), [
      "inCaption",
      "inText",
    ]);
  });

  test("finds layers by group path, owner and sublayer caption", async () => {
    const keyword = await index(
      wmsLayer("owned", { infoOwner: "Lantmäteriet" }),
      wmsLayer("subs", {
        layers: ["a", "b"],
        layersInfo: [{ id: "a", caption: "Kvartersnamn" }],
      })
    );
    assert.ok(keyword.search("Detaljer", 9, everyone).includes("sameCaption"));
    assert.deepEqual(keyword.search("Lantmäteriet", 5, everyone), ["owned"]);
    assert.deepEqual(keyword.search("Kvartersnamn", 5, everyone), ["subs"]);
  });

  test("applies the scope before the limit", async () => {
    const keyword = await index(
      wmsLayer("best", { caption: "Badplatser" }),
      wmsLayer("second", { caption: "Annat", infoText: "Om badplatser" })
    );
    const scope = {
      isAllowed: (id: string) => id !== "best",
      ownView: new Set<string>(),
    };
    assert.deepEqual(keyword.search("badplatser", 1, scope), ["second"]);
  });

  test("an own view layer only matches on its own fields", async () => {
    const keyword = await index();
    const scope = { isAllowed: () => true, ownView: new Set(["both"]) };

    assert.deepEqual(keyword.search("Egen", 5, scope), ["both"]);
    assert.ok(!keyword.search("gruppinfo", 9, scope).includes("both"));
    assert.ok(!keyword.search("Hemlig", 9, scope).includes("both"));
    // The check above only means something if it does match otherwise.
    assert.ok(keyword.search("gruppinfo", 9, everyone).includes("both"));
  });
});
