import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import type { Catalog } from "../../server/apis/v2/services/ai/catalog.service.ts";
import { buildUserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import {
  SearchService,
  fuseRankings,
} from "../../server/apis/v2/services/ai/search/search.service.ts";
import type { Embedder } from "../../server/apis/v2/services/ai/search/embedder.ts";
import {
  layersStore,
  mapConfig,
  washedMapConfig,
  wmsLayer,
} from "./fixtures.ts";
import { documentTexts, fakeEmbedder } from "./search.fixtures.ts";

const catalogWith = (...layers: object[]): Catalog => {
  const store = layersStore();
  store.wmslayers.push(...(layers as typeof store.wmslayers));
  const config = mapConfig();
  config.tools[0].options!.groups![0].layers!.push(
    ...layers.map((layer) => ({ id: (layer as { id: string }).id }))
  );
  return buildCatalog("demo", config, store);
};

const everything = (catalog: Catalog) =>
  buildUserCatalog(catalog, walkMapConfig(mapConfig()));

// A user can't reach layers that only exist in catalogWith() through this walk,
// so tests that need them pass a catalog through userOf() instead.
const userOf = (catalog: Catalog) => {
  const user = everything(catalog);
  for (const record of catalog.records) {
    if (!user.recordsById.has(record.id)) {
      user.records.push(record);
      user.recordsById.set(record.id, record);
    }
  }
  return user;
};

const ids = (result: { hits: Array<{ record: { id: string } }> }) =>
  result.hits.map((hit) => hit.record.id);

describe("fuseRankings", () => {
  const equal = (...rankings: string[][]) =>
    fuseRankings(rankings.map((ids) => ({ ids, weight: 1 })));

  test("ranks an id found by both above one found by a single ranking", () => {
    const fused = equal(["a", "b"], ["c", "b"]);
    assert.equal(fused[0].id, "b");
  });

  test("uses ranks only", () => {
    const [first, second] = equal(["a", "b"]);
    assert.equal(first.score, 1 / 11);
    assert.equal(second.score, 1 / 12);
  });

  test("a top match in one ranking beats mid-list in both", () => {
    const filler = (prefix: string) =>
      Array.from({ length: 19 }, (_, i) => `${prefix}${i}`);
    const fused = equal(
      ["top", ...filler("x"), "both"],
      [...filler("y"), "other", "both"]
    );
    const rank = (id: string) => fused.findIndex((hit) => hit.id === id);
    assert.ok(rank("top") < rank("both"));
  });

  test("weighs the rankings", () => {
    const fused = fuseRankings([
      { ids: ["keyword"], weight: 0.5 },
      { ids: ["vector"], weight: 1 },
    ]);
    assert.deepEqual(
      fused.map((hit) => hit.id),
      ["vector", "keyword"]
    );
  });

  test("handles empty rankings", () => {
    assert.deepEqual(equal([], []), []);
  });
});

describe("SearchService", () => {
  let cacheDir: string;
  let services: SearchService[];
  let listeners: Array<(file: string) => void>;
  let current: Catalog;
  let time: number;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-search-"));
    services = [];
    listeners = [];
    current = catalogWith();
    time = 1_000_000;
  });

  afterEach(async () => {
    await Promise.all(services.map((service) => service.stop()));
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  const serviceWith = (
    embedder: Embedder | null,
    maps: Record<string, object> = { demo: mapConfig() },
    options: { skipIndexBuild?: boolean } = {}
  ) => {
    const service = new SearchService({
      ...options,
      embedder,
      cacheDir,
      debounceMs: 1,
      now: () => time,
      catalogs: {
        getCatalog: async () => current,
        onChange: (listener) => {
          listeners.push(listener);
          return () => {};
        },
        startWatching: async () => {},
        stopWatching: async () => {},
      },
      config: {
        getAvailableMaps: async () => Object.keys(maps),
        getMapConfig: async (map) => maps[map],
        getLayersStore: async () => ({}),
      },
    });
    services.push(service);
    return service;
  };

  test("finds a layer by meaning, where keywords find nothing", async () => {
    current = catalogWith(wmsLayer("flood", { caption: "Översvämning" }));
    const service = serviceWith(fakeEmbedder());
    await service.buildVectors("demo");

    const result = await service.search(userOf(current), "skyfall");
    assert.equal(result.mode, "hybrid");
    assert.equal(ids(result)[0], "flood");
  });

  test("an empty query finds nothing and costs nothing", async () => {
    const embedder = fakeEmbedder();
    const result = await serviceWith(embedder).search(
      everything(current),
      "   "
    );
    assert.deepEqual(result, { hits: [], mode: "keyword" });
    assert.equal(embedder.calls.length, 0);
  });

  test("applies the limit last and returns the user's view", async () => {
    const service = serviceWith(fakeEmbedder());
    await service.buildVectors("demo");
    const user = everything(current);

    const result = await service.search(user, "Plangräns", 1);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0].record, user.recordsById.get(ids(result)[0]));
  });

  describe("places", () => {
    const mentioning = wmsLayer("mentioning", {
      caption: "Båtplatser",
      infoText: "Båtplatser vid Bryggan och längs kusten.",
    });

    test("a place ranks above a layer that only mentions it", async () => {
      current = catalogWith(mentioning);
      const service = serviceWith(null);
      const result = await service.search(userOf(current), "Bryggan", 5);
      assert.deepEqual(ids(result), ["place:Bryggan", "mentioning"]);
    });

    test("all places are found by the title of the tool", async () => {
      const service = serviceWith(null);
      const result = await service.search(userOf(current), "snabbval", 5);
      assert.deepEqual(ids(result).sort(), ["place:Bryggan", "place:Torget"]);
    });

    test("are embedded with the layers", async () => {
      const embedder = fakeEmbedder();
      await serviceWith(embedder).buildVectors("demo");
      assert.ok(documentTexts(embedder).some((t) => t.startsWith("Bryggan")));
    });

    test("a user without the preset tool never finds one", async () => {
      const config = mapConfig();
      config.tools = config.tools.filter((t) => t.type !== "preset");
      const user = buildUserCatalog(current, walkMapConfig(config));

      for (const embedder of [fakeEmbedder(), null]) {
        const service = serviceWith(embedder);
        await service.buildVectors("demo");
        const result = await service.search(user, "Bryggan", 50);
        assert.equal(
          ids(result).some((id) => id.startsWith("place:")),
          false
        );
      }
    });
  });

  describe("access", () => {
    const restrictedUser = () =>
      buildUserCatalog(current, walkMapConfig(washedMapConfig()));

    test("a disallowed layer never shows up, in any mode", async () => {
      for (const embedder of [fakeEmbedder(), null]) {
        const service = serviceWith(embedder);
        await service.buildVectors("demo");
        const result = await service.search(restrictedUser(), "Layer", 50);
        assert.ok(result.hits.length > 0);
        assert.ok(!ids(result).includes("restricted"));
        assert.ok(!ids(result).includes("unused"));
      }
    });

    test("top matches are picked after the access check", async () => {
      const service = serviceWith(fakeEmbedder());
      await service.buildVectors("demo");
      // "restricted" is the best match for everyone who can see it
      const result = await service.search(
        restrictedUser(),
        "Layer restricted",
        1
      );
      assert.equal(result.hits.length, 1);
      assert.notEqual(ids(result)[0], "restricted");
    });

    // More hidden layers than a ranking brings to the merge, all of them better
    // matches than the one the user may see. If they took up the candidates,
    // the user would get nothing, without any error.
    const crowdedCatalog = () => {
      const hidden = Array.from({ length: 60 }, (_, i) =>
        wmsLayer(`hidden${i}`, {
          caption: `Översvämning badplats ${i}`,
          infoText: "Om översvämning och badplats",
        })
      );
      const open = wmsLayer("open", {
        caption: "Plan",
        infoText: "Om översvämning och badplats",
      });
      const store = layersStore();
      store.wmslayers.push(...(hidden as typeof store.wmslayers), open);

      const withOpen = (config: ReturnType<typeof mapConfig>) => {
        config.tools[0].options!.groups![0].layers!.push({ id: "open" });
        return config;
      };
      const full = withOpen(mapConfig());
      // A group of its own, as the words of a group affect how well layers match
      full.tools[0].options!.groups!.push({
        id: "crowd",
        name: "Annat",
        layers: hidden.map(({ id }) => ({ id })),
        groups: [],
      });

      const catalog = buildCatalog("demo", full, store);
      const user = buildUserCatalog(
        catalog,
        walkMapConfig(withOpen(washedMapConfig()))
      );
      return { catalog, user };
    };

    test("hidden layers can't crowd out keyword matches", async () => {
      const { catalog, user } = crowdedCatalog();
      current = catalog;
      const result = await serviceWith(null).search(user, "badplats");
      assert.deepEqual(ids(result), ["open"]);
    });

    test("hidden layers can't crowd out vector matches", async () => {
      const { catalog, user } = crowdedCatalog();
      current = catalog;
      const service = serviceWith(fakeEmbedder());
      await service.buildVectors("demo");

      // Only the vector side can find this word
      const result = await service.search(user, "skyfall");
      assert.equal(result.mode, "hybrid");
      assert.ok(ids(result).includes("open"));
      assert.ok(!ids(result).some((id) => id.startsWith("hidden")));
    });

    test("group info can't lift a layer the user only has in Search", async () => {
      const service = serviceWith(fakeEmbedder());
      await service.buildVectors("demo");

      const full = await service.search(everything(current), "gruppinfo", 50);
      assert.ok(ids(full).includes("both"));

      const limited = await service.search(restrictedUser(), "gruppinfo", 50);
      assert.ok(!ids(limited).includes("both"));

      // The fake embedder has a "hemlig" concept, so this covers vectors too
      const byMeaning = await service.search(restrictedUser(), "hemlig", 50);
      assert.equal(byMeaning.mode, "hybrid");
      assert.ok(!ids(byMeaning).includes("both"));
    });

    test("such a layer is still found by its own text, as a search record", async () => {
      const service = serviceWith(fakeEmbedder());
      await service.buildVectors("demo");

      const { hits } = await service.search(restrictedUser(), "Egen text");
      const hit = hits.find((h) => h.record.id === "both");
      assert.equal(hit?.record.role, "search");
      assert.deepEqual(hit?.record.groupPath, []);
      assert.equal(hit?.record.text, "Egen text");
    });
  });

  describe("fallback to keyword search", () => {
    test("without an embedder", async () => {
      const service = serviceWith(null);
      const result = await service.search(everything(current), "Plangräns");
      assert.equal(result.mode, "keyword");
      assert.ok(ids(result).includes("plain"));
    });

    test("while the index isn't ready, which also starts the build", async () => {
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);

      const first = await service.search(everything(current), "Plangräns");
      assert.equal(first.mode, "keyword");
      assert.ok(ids(first).includes("plain"));

      await service.buildVectors("demo");
      assert.ok(documentTexts(embedder).length > 0);
      const second = await service.search(everything(current), "Plangräns");
      assert.equal(second.mode, "hybrid");
    });

    test("when the query can't be embedded", async () => {
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      await service.buildVectors("demo");
      embedder.fail = (inputType) => inputType === "query";

      const result = await service.search(everything(current), "Plangräns");
      assert.equal(result.mode, "keyword");
      assert.ok(ids(result).includes("plain"));
    });

    test("when the query embedding hangs, it gives up in time", async () => {
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      await service.buildVectors("demo");

      embedder.embed = (_texts, _inputType, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        });

      const started = Date.now();
      const result = await service.search(everything(current), "Plangräns");
      assert.equal(result.mode, "keyword");
      assert.ok(ids(result).includes("plain"));
      assert.ok(Date.now() - started < 3_000);
    });

    test("when the build fails, and retries only after a while", async () => {
      const embedder = fakeEmbedder();
      embedder.fail = () => true;
      const service = serviceWith(embedder);
      await service.buildVectors("demo");
      assert.equal(embedder.calls.length, 1);

      // stop() waits for any build the search may have started
      const user = everything(current);
      assert.equal((await service.search(user, "Plangräns")).mode, "keyword");
      await service.stop();
      assert.equal(embedder.calls.length, 1);

      embedder.fail = () => false;
      time += 5 * 60_000;
      await service.search(user, "Plangräns");
      await service.stop();
      assert.equal((await service.search(user, "Plangräns")).mode, "hybrid");
    });
  });

  describe("vector cache", () => {
    const cacheFile = () => path.join(cacheDir, "demo.vectors.json");

    test("is written in its folder, and a new run embeds nothing", async () => {
      await serviceWith(fakeEmbedder()).buildVectors("demo");
      assert.ok(fs.existsSync(cacheFile()));

      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      await service.buildVectors("demo");
      assert.deepEqual(documentTexts(embedder), []);

      const result = await service.search(everything(current), "Plangräns");
      assert.equal(result.mode, "hybrid");
    });

    test("only a changed layer is embedded again", async () => {
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      current = catalogWith(wmsLayer("edited", { infoText: "Före" }));
      await service.buildVectors("demo");
      embedder.calls.length = 0;

      current = catalogWith(wmsLayer("edited", { infoText: "Efter" }));
      await service.buildVectors("demo");

      const texts = documentTexts(embedder);
      assert.equal(texts.length, 1);
      assert.ok(texts[0].includes("Efter"));
    });

    describe("with AI_DEBUG_SKIP_INDEX_BUILD", () => {
      const skipping = (embedder: Embedder) =>
        serviceWith(embedder, undefined, { skipIndexBuild: true });

      test("a changed layer isn't embedded, and the file isn't touched", async () => {
        current = catalogWith(wmsLayer("edited", { infoText: "Före" }));
        await serviceWith(fakeEmbedder()).buildVectors("demo");
        const before = fs.readFileSync(cacheFile(), "utf-8");

        current = catalogWith(wmsLayer("edited", { infoText: "Efter" }));
        const embedder = fakeEmbedder();
        await skipping(embedder).buildVectors("demo");

        assert.deepEqual(documentTexts(embedder), []);
        assert.equal(fs.readFileSync(cacheFile(), "utf-8"), before);
      });

      test("a layer without a vector is still found by keywords", async () => {
        await serviceWith(fakeEmbedder()).buildVectors("demo");

        current = catalogWith(wmsLayer("added", { caption: "Snorkelplatser" }));
        const service = skipping(fakeEmbedder());
        await service.buildVectors("demo");

        const result = await service.search(userOf(current), "Snorkelplatser");
        assert.equal(result.mode, "hybrid");
        assert.ok(ids(result).includes("added"));
      });

      test("builds as usual when there is no cache", async () => {
        const embedder = fakeEmbedder();
        await skipping(embedder).buildVectors("demo");

        assert.ok(documentTexts(embedder).length > 0);
        assert.ok(fs.existsSync(cacheFile()));
      });

      test("builds as usual when the cache is from another model", async () => {
        await serviceWith(fakeEmbedder("fake:model-a")).buildVectors("demo");

        const embedder = fakeEmbedder("fake:model-b");
        await skipping(embedder).buildVectors("demo");

        assert.ok(documentTexts(embedder).length > 0);
      });

      test("is read from .env, and is off by default", async () => {
        const build = async () => {
          current = catalogWith(wmsLayer("edited", { infoText: `${time++}` }));
          const embedder = fakeEmbedder();
          const service = new SearchService({
            embedder,
            cacheDir,
            catalogs: {
              getCatalog: async () => current,
              onChange: () => () => {},
              startWatching: async () => {},
              stopWatching: async () => {},
            },
          });
          await service.buildVectors("demo");
          return documentTexts(embedder).length;
        };
        await serviceWith(fakeEmbedder()).buildVectors("demo");

        assert.equal(await build(), 1);
        process.env.AI_DEBUG_SKIP_INDEX_BUILD = "true";
        try {
          assert.equal(await build(), 0);
        } finally {
          delete process.env.AI_DEBUG_SKIP_INDEX_BUILD;
        }
      });
    });

    test("a new embedding model embeds everything again", async () => {
      await serviceWith(fakeEmbedder("fake:model-a")).buildVectors("demo");

      const other = fakeEmbedder("fake:model-b");
      await serviceWith(other).buildVectors("demo");
      assert.equal(documentTexts(other).length, current.records.length);
    });

    test("layers with the same text are embedded once", async () => {
      const twin = { caption: "Tvilling", infoText: "Samma" };
      current = catalogWith(wmsLayer("one", twin), wmsLayer("two", twin));
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      await service.buildVectors("demo");

      const texts = documentTexts(embedder);
      assert.equal(texts.filter((t) => t.includes("Tvilling")).length, 1);
      assert.equal(new Set(texts).size, texts.length);

      const result = await service.search(userOf(current), "Tvilling", 2);
      assert.deepEqual(ids(result).sort(), ["one", "two"]);
    });

    test("batches stay within the embedder's limit", async () => {
      const embedder = fakeEmbedder("fake:model", 3);
      await serviceWith(embedder).buildVectors("demo");
      assert.ok(embedder.calls.length > 1);
      assert.ok(embedder.calls.every((call) => call.texts.length <= 3));
    });

    test("a failed build keeps the batches that made it", async () => {
      const failing = fakeEmbedder("fake:model", 3);
      failing.fail = (_inputType, callNumber) => callNumber === 2;
      await serviceWith(failing).buildVectors("demo");

      const embedder = fakeEmbedder("fake:model", 3);
      await serviceWith(embedder).buildVectors("demo");
      assert.equal(documentTexts(embedder).length, current.records.length - 3);
    });
  });

  describe("building", () => {
    test("runs one build at a time", async () => {
      let running = 0;
      let most = 0;
      const embedder = fakeEmbedder("fake:model", 2);
      const embed = embedder.embed;
      embedder.embed = async (...args) => {
        most = Math.max(most, ++running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        return embed(...args);
      };
      const service = serviceWith(embedder);

      const first = service.buildVectors("demo");
      current = catalogWith(wmsLayer("added"));
      await Promise.all([first, service.buildVectors("demo")]);
      assert.equal(most, 1);
    });

    test("an unchanged catalog is not built again", async () => {
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      await service.buildVectors("demo");
      const calls = embedder.calls.length;

      await service.buildVectors("demo");
      assert.equal(embedder.calls.length, calls);
    });

    test("start indexes only the maps that have the chat", async () => {
      const noChat = { tools: [{ type: "layerswitcher", options: {} }] };
      const service = serviceWith(fakeEmbedder(), {
        demo: mapConfig(),
        other: noChat,
      });
      await service.start();
      await service.stop();

      assert.deepEqual(fs.readdirSync(cacheDir), ["demo.vectors.json"]);
    });

    test("a burst of file changes gives one rebuild", async () => {
      const embedder = fakeEmbedder();
      const service = serviceWith(embedder);
      await service.start();
      await service.buildVectors("demo");
      embedder.calls.length = 0;

      current = catalogWith(wmsLayer("added", { infoText: "Ny" }));
      listeners.forEach((listener) => listener("map_1.json"));
      listeners.forEach((listener) => listener("layers.json"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await service.buildVectors("demo");

      assert.equal(documentTexts(embedder).length, 1);
    });

    test("without an embedder, start does nothing", async () => {
      await serviceWith(null).start();
      assert.equal(listeners.length, 0);
    });
  });
});
