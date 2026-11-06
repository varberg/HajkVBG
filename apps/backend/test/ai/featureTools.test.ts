import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildUserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import type { RawMapConfig } from "../../server/apis/v2/services/ai/catalog.service.ts";
import { FeatureResultStore } from "../../server/apis/v2/services/ai/features/featureResults.ts";
import type {
  Feature,
  Geometry,
} from "../../server/apis/v2/services/ai/features/geojson.ts";
import type { WfsAccess } from "../../server/apis/v2/services/ai/features/wfsAccess.ts";
import { WfsClient } from "../../server/apis/v2/services/ai/features/wfsClient.ts";
import type { WfsResult } from "../../server/apis/v2/services/ai/features/wfsClient.ts";
import type { GetFeatureOptions } from "../../server/apis/v2/services/ai/features/wfsQuery.ts";
import { buildSystemPrompt } from "../../server/apis/v2/services/ai/prompt.ts";
import { PAGE_SIZE, runTool } from "../../server/apis/v2/services/ai/tools.ts";
import type {
  ToolContext,
  ToolEvent,
} from "../../server/apis/v2/services/ai/tools.ts";
import {
  featureMapConfig,
  featureStore,
  mapConfig,
  layersStore,
  washedFeatureMapConfig,
} from "./fixtures.ts";

const point = (x: number, y = 0): Geometry => ({
  type: "Point",
  coordinates: [x, y],
});

const feature = (
  id: string,
  properties: Record<string, unknown> = {},
  geometry: Geometry | null = point(0)
): Feature => ({ type: "Feature", id, geometry, properties });

const features = (count: number, prefix = "adress"): Feature[] =>
  Array.from({ length: count }, (_, i) =>
    feature(`${prefix}.${i}`, { sok: `Gata ${i}` })
  );

interface Call {
  typeName: string;
  options: GetFeatureOptions;
}

type Answer = (call: Call) => Feature[] | number;

/**
 * A source that answers from a function. A number is the total of a count, and
 * features are cut to the count of the request, as a real source does.
 */
const fakeWfs = (
  answer: Answer,
  catalog = buildCatalog("demo", featureMapConfig(), featureStore())
) => {
  const calls: Call[] = [];
  const wfs: WfsAccess = {
    connectionOf: async (_map, id) => catalog.featureConnections.get(id),
    async query(target, options): Promise<WfsResult> {
      const call = { typeName: target.typeName, options };
      calls.push(call);
      const result = answer(call);
      return typeof result === "number"
        ? { features: [], total: result }
        : {
            features: result.slice(0, options.count),
            total: result.length,
          };
    },
  };
  return { wfs, calls };
};

const view = (config: RawMapConfig = featureMapConfig()) =>
  buildUserCatalog(
    buildCatalog("demo", featureMapConfig(), featureStore()),
    walkMapConfig(config)
  );

const context = (
  wfs: WfsAccess,
  overrides: Partial<ToolContext> = {}
): ToolContext => ({
  userCatalog: view(),
  maxLayersOn: 25,
  visibleLayers: new Set(),
  search: { search: async () => ({ hits: [], mode: "keyword" }) },
  wfs,
  featureResults: new FeatureResultStore(),
  signal: new AbortController().signal,
  wfsRequests: 0,
  ...overrides,
});

const NO_CRITERIA = {
  text: null,
  filters: null,
  near: null,
  sort: null,
  count_only: false,
  offset: 0,
};

async function call(name: string, input: unknown, ctx: ToolContext) {
  const run = await runTool(name, input, ctx);
  return { ...run, result: JSON.parse(run.content) };
}

const search = (ctx: ToolContext, input: object = {}) =>
  call(
    "search_features",
    { source_id: "adress", ...NO_CRITERIA, ...input },
    ctx
  );

const show = (ctx: ToolContext, resultIds: string[], featureIds?: string[]) =>
  call(
    "show_features",
    { result_ids: resultIds, feature_ids: featureIds ?? null },
    ctx
  );

const shownEvent = (events: ToolEvent[]) => {
  const event = events[0];
  assert.equal(events.length, 1);
  assert.ok(event.type === "action" && event.action === "show_features");
  return event;
};

const ids = (result: { features: Array<{ id?: string }> }) =>
  result.features.map((f) => f.id);

/** Finds a feature, so that it can be used in `near`. */
async function found(ctx: ToolContext, sourceId = "adress") {
  const { result } = await search(ctx, { source_id: sourceId });
  return result.features[0].id as string;
}

const nearInput = (featureId: string, distance = 100) => ({
  near: { feature_id: featureId, distance_m: distance },
});

describe("search_features", () => {
  test("gives compact features with allowed fields and no geometry", async () => {
    const { wfs } = fakeWfs(() => [
      feature("adress.1", {
        sok: "Kungsgatan 1",
        postort: "Varberg",
        gata: "",
        hemlig: "Får inte synas",
      }),
    ]);
    const { result, content } = await search(context(wfs));

    assert.deepEqual(result, {
      resultId: "r1",
      source: "Källa adress",
      total: 1,
      reachable: 1,
      truncated: false,
      offset: 0,
      features: [
        {
          id: "adress.1",
          title: "Kungsgatan 1 | Adress | Varberg",
          geometryType: "Point",
          fields: { sok: "Kungsgatan 1", postort: "Varberg" },
        },
      ],
    });
    assert.equal(content.includes("coordinates"), false);
    assert.equal(content.includes("Får inte synas"), false);
  });

  test("never gives a URL", async () => {
    const { wfs } = fakeWfs(() => features(2));
    const { content } = await search(context(wfs));
    assert.equal(content.includes("secret.example.com"), false);
  });

  test("gives an empty title when the display fields are", async () => {
    const { wfs } = fakeWfs(() => [feature("sjo.1", { maxdjup: 5 })]);
    const { result } = await search(context(wfs), { source_id: "sjo" });
    assert.equal(result.features[0].title, "");
    assert.deepEqual(result.features[0].fields, { maxdjup: 5 });
  });

  test("keeps a value of 0, which isn't empty", async () => {
    const { wfs } = fakeWfs(() => [feature("sjo.1", { maxdjup: 0 })]);
    const { result } = await search(context(wfs), { source_id: "sjo" });
    assert.deepEqual(result.features[0].fields, { maxdjup: 0 });
  });

  test("cuts long values", async () => {
    const { wfs } = fakeWfs(() => [feature("a.1", { gata: "x".repeat(400) })]);
    const { result } = await search(context(wfs));
    assert.equal(result.features[0].fields.gata.length, 300);
  });

  test("handles a feature without properties or geometry", async () => {
    const { wfs } = fakeWfs(() => [
      { type: "Feature", id: "a.1", geometry: null, properties: null },
    ]);
    const { result } = await search(context(wfs));
    assert.deepEqual(result.features[0], {
      id: "a.1",
      title: "Adress",
      geometryType: null,
      fields: {},
    });
  });

  test("sends the text and the filters", async () => {
    const { wfs, calls } = fakeWfs(() => []);
    await search(context(wfs), {
      text: "  Kungsgatan 12 ",
      filters: [{ field: "postort", op: "eq", value: "Varberg" }],
    });
    const { filter } = calls[0].options;
    assert.match(filter, /\*Kungsgatan 12\*/);
    assert.match(filter, /PropertyIsEqualTo/);
    assert.match(filter, /Varberg/);
  });

  test("lists everything with no criteria", async () => {
    const { wfs, calls } = fakeWfs(() => features(3));
    const { result } = await search(context(wfs));
    assert.equal(calls[0].options.filter, "");
    assert.equal(result.total, 3);
  });

  describe("access", () => {
    test("needs a source to pass all three checks", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      // Not listed, not in Search, not WFS, and not known at all
      for (const id of ["ejlistad", "ejisok", "searchWms", "okand"]) {
        const { isError, result } = await search(context(wfs), {
          source_id: id,
        });
        assert.equal(isError, true, id);
        assert.equal(result.error, "Unknown id.", id);
      }
      assert.equal(calls.length, 0);
    });

    test("a restricted source looks like one that doesn't exist", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      const ctx = context(wfs, { userCatalog: view(washedFeatureMapConfig()) });
      const restricted = await search(ctx, { source_id: "begransad" });
      const unknown = await search(ctx, { source_id: "okand" });
      assert.equal(restricted.content, unknown.content);
      assert.equal(calls.length, 0);
    });

    test("is rejected if the catalog has lost the connection", async () => {
      const { wfs } = fakeWfs(() => []);
      const { result } = await search(
        context({ ...wfs, connectionOf: async () => undefined })
      );
      assert.equal(result.error, "Unknown id.");
    });
  });

  describe("fields", () => {
    test("rejects a field that isn't allowed in filters", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      const { isError, result } = await search(context(wfs), {
        filters: [{ field: "hemlig", op: "eq", value: "1" }],
      });
      assert.equal(isError, true);
      assert.match(result.error, /hemlig/);
      assert.equal(calls.length, 0);
    });

    test("rejects a field that isn't allowed in sort", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      const { isError } = await search(context(wfs), {
        sort: { field: "hemlig", descending: false },
      });
      assert.equal(isError, true);
      assert.equal(calls.length, 0);
    });

    test("allows a field from a placeholder with a format", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      await search(context(wfs), {
        filters: [{ field: "adat", op: "gt", value: "2020" }],
      });
      assert.equal(calls.length, 1);
    });

    test("doesn't take a label for a field", async () => {
      const { wfs } = fakeWfs(() => []);
      const { isError } = await search(context(wfs), {
        sort: { field: '"Adress"', descending: false },
      });
      assert.equal(isError, true);
    });

    test("allows the extra fields of a source", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      await search(context(wfs), {
        source_id: "sjo",
        sort: { field: "maxdjup", descending: true },
      });
      assert.equal(calls.length, 1);
    });
  });

  describe("paging", () => {
    test("gives one page, and says how much there is", async () => {
      const { wfs } = fakeWfs(() => features(40));
      const { result } = await search(context(wfs));
      assert.equal(result.features.length, PAGE_SIZE);
      assert.equal(result.total, 40);
      assert.equal(result.reachable, 40);
      assert.equal(result.truncated, true);
    });

    test("isn't truncated on the last page", async () => {
      const { wfs } = fakeWfs(() => features(40));
      const { result } = await search(context(wfs), { offset: 25 });
      assert.equal(result.features.length, 15);
      assert.equal(result.truncated, false);
    });

    test("fetches at most 250, and reachable tells so", async () => {
      const { wfs, calls } = fakeWfs(() => features(300));
      const { result } = await search(context(wfs), { offset: 225 });
      assert.equal(calls[0].options.count, 250);
      assert.equal(result.total, 300);
      assert.equal(result.reachable, 250);
      assert.equal(result.features.length, 25);
      assert.equal(result.truncated, true);
    });

    test("never repeats a feature, also when sort values tie", async () => {
      // All sort values are the same, and pages are cut from one fetch
      const rows = features(60).map((f) => ({
        ...f,
        properties: { sok: "Samma" },
      }));
      const { wfs, calls } = fakeWfs(() => rows);
      const ctx = context(wfs);
      const pages = [];
      for (const offset of [0, 25, 50]) {
        pages.push(...ids((await search(ctx, { offset })).result));
      }
      assert.equal(new Set(pages).size, 60);
      assert.equal(
        calls.every((c) => c.options.count === 250),
        true
      );
    });

    test("gives the pages of a query the same result id", async () => {
      const { wfs } = fakeWfs(() => features(40));
      const ctx = context(wfs);
      const first = await search(ctx);
      const second = await search(ctx, { offset: 25 });
      assert.equal(first.result.resultId, second.result.resultId);
    });

    test("rejects a negative offset", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      const { isError } = await search(context(wfs), { offset: -1 });
      assert.equal(isError, true);
      assert.equal(calls.length, 0);
    });
  });

  describe("sorting", () => {
    test("uses the first real display field by default", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      await search(context(wfs));
      assert.deepEqual(calls[0].options.sort, {
        field: "sok",
        descending: false,
      });
    });

    test("doesn't leave out empty values for the default order", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      await search(context(wfs));
      assert.equal(calls[0].options.filter.includes("PropertyIsNull"), false);
    });

    test("leaves out features with no value in the sort field", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      await search(context(wfs), {
        source_id: "sjo",
        sort: { field: "maxdjup", descending: true },
      });
      const { filter, sort } = calls[0].options;
      assert.match(filter, /<fes:Not><fes:PropertyIsNull>/);
      assert.match(filter, /maxdjup/);
      assert.deepEqual(sort, { field: "maxdjup", descending: true });
    });
  });

  describe("count_only", () => {
    test("asks for no features, and gives the total", async () => {
      const { wfs, calls } = fakeWfs(() => 32220);
      const { result } = await search(context(wfs), { count_only: true });
      assert.equal(calls[0].options.count, 0);
      assert.equal(result.total, 32220);
      assert.equal(result.source, "Källa adress");
      assert.equal("features" in result, false);
    });

    test("ignores sort, so empty values count", async () => {
      const { wfs, calls } = fakeWfs(() => 963);
      await search(context(wfs), {
        source_id: "sjo",
        count_only: true,
        sort: { field: "maxdjup", descending: true },
      });
      assert.equal(calls[0].options.sort, null);
      assert.equal(calls[0].options.filter, "");
    });

    test("gives a result that can be shown", async () => {
      const { wfs } = fakeWfs(({ options }) =>
        options.count === 0 ? 3 : features(3)
      );
      const ctx = context(wfs);
      const { result } = await search(ctx, { count_only: true });
      assert.equal((await show(ctx, [result.resultId])).result.shown, 3);
    });
  });

  describe("near", () => {
    // The first search finds the anchor at the origin
    const anchored = (rows: Feature[] | number, countAs?: number) => {
      const fake = fakeWfs(({ options }) => {
        if (options.filter.includes("ResourceId")) {
          return [feature("adress.0")];
        }
        if (options.filter.includes("DWithin")) {
          if (options.count === 0) {
            return countAs ?? (typeof rows === "number" ? rows : rows.length);
          }
          return rows;
        }
        if (options.filter.includes("Intersects")) {
          return rows;
        }
        return [feature("adress.0")];
      });
      return fake;
    };

    test("sorts by distance, and gives it", async () => {
      const { wfs } = anchored([
        feature("b.far", {}, point(300)),
        feature("b.near", {}, point(100.4)),
        feature("b.mid", {}, point(200)),
      ]);
      const ctx = context(wfs);
      const id = await found(ctx);
      const { result } = await search(ctx, {
        source_id: "sjo",
        ...nearInput(id, 500),
      });
      assert.deepEqual(ids(result), ["b.near", "b.mid", "b.far"]);
      assert.deepEqual(
        result.features.map((f: { distanceM: number }) => f.distanceM),
        [100, 200, 300]
      );
    });

    test("sends the geometry of the anchor, in the map's projection", async () => {
      const { wfs, calls } = anchored([]);
      const ctx = context(wfs);
      await search(ctx, { ...nearInput(await found(ctx), 1000) });
      const { filter } = calls.at(-1)!.options;
      assert.match(filter, /<gml:Point srsName="EPSG:3007">/);
      assert.match(filter, /<fes:Distance uom="m">1000</);
    });

    test("uses Intersects for a distance of 0", async () => {
      const { wfs, calls } = anchored([]);
      const ctx = context(wfs);
      await search(ctx, nearInput(await found(ctx), 0));
      assert.match(calls.at(-1)!.options.filter, /<fes:Intersects>/);
    });

    test("takes a whole number as distance_m", async () => {
      const { wfs } = anchored([]);
      const ctx = context(wfs);
      const { isError } = await search(ctx, nearInput(await found(ctx), 1000));
      assert.equal(isError, false);
    });

    test("rejects a distance that isn't whole, or is negative", async () => {
      const { wfs } = anchored([]);
      const ctx = context(wfs);
      const id = await found(ctx);
      assert.equal((await search(ctx, nearInput(id, 1.5))).isError, true);
      assert.equal((await search(ctx, nearInput(id, -1))).isError, true);
    });

    test("above 250 matches, gives tooMany and fetches no features", async () => {
      const { wfs, calls } = anchored(2506);
      const ctx = context(wfs);
      const id = await found(ctx);
      calls.length = 0;
      const { result } = await search(ctx, nearInput(id, 1000));
      assert.deepEqual(result, {
        source: "Källa adress",
        total: 2506,
        tooMany: true,
        features: [],
      });
      assert.equal(
        calls.some((c) => c.options.count > 1),
        false
      );
    });

    test("exactly 250 matches can be sorted", async () => {
      const { wfs } = anchored(features(250, "b"));
      const ctx = context(wfs);
      const { result } = await search(ctx, nearInput(await found(ctx), 1000));
      assert.equal(result.tooMany, undefined);
      assert.equal(result.reachable, 250);
    });

    test("with sort, the sort decides and there is no limit", async () => {
      const rows = features(300, "b");
      const { wfs, calls } = anchored(rows);
      const ctx = context(wfs);
      const id = await found(ctx);
      calls.length = 0;
      const { result } = await search(ctx, {
        ...nearInput(id),
        sort: { field: "sok", descending: true },
      });
      assert.equal(result.tooMany, undefined);
      assert.deepEqual(calls.at(-1)!.options.sort, {
        field: "sok",
        descending: true,
      });
      assert.equal(typeof result.features[0].distanceM, "number");
      assert.equal(result.features[0].id, "b.0");
    });

    test("rejects an unknown feature, with no request", async () => {
      const { wfs, calls } = anchored([]);
      const { result } = await search(context(wfs), nearInput("adress.999"));
      assert.equal(result.error, "Unknown id.");
      assert.equal(calls.length, 0);
    });

    test("checks access to the source of the anchor again", async () => {
      const { wfs, calls } = anchored([]);
      const ctx = context(wfs);
      const id = await found(ctx, "begransad");
      calls.length = 0;

      ctx.userCatalog = view(washedFeatureMapConfig());
      const { result } = await search(ctx, nearInput(id));
      assert.equal(result.error, "Unknown id.");
      assert.equal(calls.length, 0);
    });

    test("rejects an anchor that no longer exists", async () => {
      let gone = false;
      const { wfs } = fakeWfs(({ options }) =>
        gone && options.filter.includes("ResourceId")
          ? []
          : [feature("adress.0")]
      );
      const ctx = context(wfs);
      const id = await found(ctx);
      gone = true;
      assert.equal(
        (await search(ctx, nearInput(id))).result.error,
        "Unknown id."
      );
    });

    test("puts features without geometry last, with no distance", async () => {
      const { wfs } = anchored([
        feature("b.none", {}, null),
        feature("b.some", {}, point(5)),
      ]);
      const ctx = context(wfs);
      const { result } = await search(ctx, nearInput(await found(ctx)));
      assert.deepEqual(ids(result), ["b.some", "b.none"]);
      assert.equal("distanceM" in result.features[1], false);
    });
  });

  describe("unstable ids", () => {
    test("leaves out fid- ids, and keeps the feature", async () => {
      const { wfs } = fakeWfs(() => [feature("fid-1a2b", { sok: "Något" })]);
      const { result } = await search(context(wfs));
      assert.equal("id" in result.features[0], false);
      assert.equal(result.features[0].title, "Något | Adress");
    });

    test("can't use a fid- id in near", async () => {
      const { wfs } = fakeWfs(() => [feature("fid-1a2b")]);
      const ctx = context(wfs);
      await search(ctx);
      const { result } = await search(ctx, nearInput("fid-1a2b"));
      assert.equal(result.error, "Unknown id.");
    });
  });

  describe("request cap", () => {
    test("holds when tools run in parallel", async () => {
      const { wfs, calls } = fakeWfs(() => []);
      const ctx = context(wfs);
      const runs = await Promise.all(
        Array.from({ length: 30 }, () => search(ctx))
      );
      assert.equal(calls.length, 20);
      assert.equal(runs.filter((run) => run.isError).length, 10);
    });

    test("tells the model what to do", async () => {
      const { wfs } = fakeWfs(() => []);
      const { result } = await search(context(wfs, { wfsRequests: 20 }));
      assert.match(result.error, /Answer with what you have/);
    });
  });

  describe("a failing source", () => {
    const failing = (fetch: typeof globalThis.fetch, timeoutMs = 1000) => {
      const client = new WfsClient({ timeoutMs, fetch });
      const { wfs } = fakeWfs(() => []);
      return context({
        ...wfs,
        query: (target, options, signal) =>
          client.query(target, options, signal),
      });
    };

    const assertSafe = async (ctx: ToolContext) => {
      const { isError, content, result } = await search(ctx);
      assert.equal(isError, true);
      assert.equal(result.error, "The source can't be reached right now.");
      assert.equal(content.includes("secret.example.com"), false);
    };

    test("gives the safe error on a redirect", async () => {
      await assertSafe(
        failing(async () => {
          throw new TypeError("redirect to https://secret.example.com/login");
        })
      );
    });

    test("gives the safe error on what GeoServer says", async () => {
      await assertSafe(
        failing(
          async () =>
            new Response("<ows:Exception>ws:secret</ows:Exception>", {
              status: 400,
              headers: { "Content-Type": "text/xml" },
            })
        )
      );
    });
  });
});

describe("show_features", () => {
  test("sends the full features of a result to the browser only", async () => {
    const row = feature("adress.1", { sok: "A", hemlig: "Till infoboxen" });
    const { wfs } = fakeWfs(() => [row]);
    const ctx = context(wfs);
    const { result } = await search(ctx);
    const { events, content } = await show(ctx, [result.resultId]);

    assert.deepEqual(shownEvent(events).collections, [
      {
        sourceId: "adress",
        featureCollection: { type: "FeatureCollection", features: [row] },
      },
    ]);
    assert.equal(content.includes("coordinates"), false);
    assert.equal(content.includes("Till infoboxen"), false);
  });

  test("runs the stored query again", async () => {
    const { wfs, calls } = fakeWfs(() => features(2));
    const ctx = context(wfs);
    const { result } = await search(ctx, { text: "Kungsgatan" });
    await show(ctx, [result.resultId]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], calls[0]);
  });

  test("reports what was shown", async () => {
    const { wfs } = fakeWfs(() => features(3));
    const ctx = context(wfs);
    const { result } = await search(ctx);
    assert.deepEqual((await show(ctx, [result.resultId])).result, {
      shown: 3,
      total: 3,
      truncated: false,
      rejected: [],
    });
  });

  test("can pick features from a result", async () => {
    const { wfs } = fakeWfs(() => features(3));
    const ctx = context(wfs);
    const { result } = await search(ctx);
    const { result: shown, events } = await show(
      ctx,
      [result.resultId],
      ["adress.1"]
    );
    assert.deepEqual(shown, {
      shown: 1,
      total: 1,
      truncated: false,
      rejected: [],
    });
    const [{ featureCollection }] = shownEvent(events).collections;
    assert.deepEqual(
      featureCollection.features.map((f) => f.id),
      ["adress.1"]
    );
  });

  test("is capped at 250 features in total, across results", async () => {
    const { wfs } = fakeWfs(({ typeName }) =>
      features(200, typeName === "ws:adress" ? "a" : "b")
    );
    const ctx = context(wfs);
    const first = await search(ctx);
    const second = await search(ctx, { source_id: "sjo" });
    const { result, events } = await show(ctx, [
      first.result.resultId,
      second.result.resultId,
    ]);
    assert.equal(result.shown, 250);
    assert.equal(result.total, 400);
    assert.equal(result.truncated, true);
    assert.deepEqual(
      shownEvent(events).collections.map(
        (c) => c.featureCollection.features.length
      ),
      [200, 50]
    );
  });

  test("says when a result had more than could be fetched", async () => {
    const { wfs } = fakeWfs(() => features(300));
    const ctx = context(wfs);
    const { result } = await search(ctx);
    const shown = (await show(ctx, [result.resultId])).result;
    assert.equal(shown.shown, 250);
    assert.equal(shown.total, 300);
    assert.equal(shown.truncated, true);
  });

  test("shows a feature in two results once, and isn't truncated", async () => {
    const { wfs } = fakeWfs(() => features(3));
    const ctx = context(wfs);
    const first = await search(ctx, { text: "a" });
    const second = await search(ctx, { text: "b" });
    const { result, events } = await show(ctx, [
      first.result.resultId,
      second.result.resultId,
    ]);
    assert.deepEqual(result, {
      shown: 3,
      total: 3,
      truncated: false,
      rejected: [],
    });
    assert.equal(shownEvent(events).collections.length, 1);
  });

  test("rejects an unknown result and sends nothing", async () => {
    const { wfs, calls } = fakeWfs(() => []);
    const { result, events } = await show(context(wfs), ["r99"]);
    assert.deepEqual(result.rejected, [{ id: "r99", reason: "Unknown id." }]);
    assert.equal(result.shown, 0);
    assert.deepEqual(events, []);
    assert.equal(calls.length, 0);
  });

  test("rejects an unknown feature and shows the rest", async () => {
    const { wfs } = fakeWfs(() => features(2));
    const ctx = context(wfs);
    const { result } = await search(ctx);
    const { result: shown } = await show(
      ctx,
      [result.resultId],
      ["adress.0", "adress.99"]
    );
    assert.equal(shown.shown, 1);
    assert.deepEqual(shown.rejected, [
      { id: "adress.99", reason: "Unknown id." },
    ]);
  });

  test("checks access to a stored result again", async () => {
    const { wfs, calls } = fakeWfs(() => features(2, "b"));
    const ctx = context(wfs);
    const { result } = await search(ctx, { source_id: "begransad" });
    calls.length = 0;

    ctx.userCatalog = view(washedFeatureMapConfig());
    const shown = await show(ctx, [result.resultId]);
    assert.deepEqual(shown.result.rejected, [
      { id: result.resultId, reason: "Unknown id." },
    ]);
    assert.deepEqual(shown.events, []);
    assert.equal(calls.length, 0);
  });

  test("a failing result doesn't stop the others", async () => {
    const fake = fakeWfs(() => features(2));
    let failing = false;
    const ctx = context({
      ...fake.wfs,
      async query(target, options, signal) {
        if (failing && target.typeName === "ws:sjo") {
          const client = new WfsClient({
            timeoutMs: 100,
            fetch: async () => new Response("Nej", { status: 500 }),
          });
          return client.query(target, options, signal);
        }
        return fake.wfs.query(target, options, signal);
      },
    });
    const first = await search(ctx);
    const second = await search(ctx, { source_id: "sjo" });
    failing = true;
    const { result } = await show(ctx, [
      first.result.resultId,
      second.result.resultId,
    ]);
    assert.equal(result.shown, 2);
    assert.deepEqual(result.rejected, [
      {
        id: second.result.resultId,
        reason: "The source can't be reached right now.",
      },
    ]);
  });
});

describe("clear_features", () => {
  test("clears the search in the browser, and makes no request", async () => {
    const { wfs, calls } = fakeWfs(() => []);
    const { result, events } = await call("clear_features", {}, context(wfs));
    assert.deepEqual(result, { cleared: true });
    assert.deepEqual(events, [{ type: "action", action: "clear_features" }]);
    assert.equal(calls.length, 0);
  });
});

describe("the prompt", () => {
  const prompt = buildSystemPrompt(view());

  test("lists the sources with their fields", () => {
    assert.ok(
      prompt.includes(
        "- Källa adress [adress]: Alla adresser i kommunen. Fields: sok, postort, gata, adat, kod"
      )
    );
    assert.ok(prompt.includes("- Källa sjo [sjo]: Fields: namn, maxdjup"));
  });

  test("leaves out sources the user can't reach", () => {
    assert.equal(prompt.includes("[ejlistad]"), false);
    assert.equal(
      buildSystemPrompt(view(washedFeatureMapConfig())).includes("[begransad]"),
      false
    );
  });

  test("holds no URLs", () => {
    assert.equal(prompt.includes("secret.example.com"), false);
  });

  test("says how to reach an address", () => {
    assert.ok(prompt.includes("That is how to reach an address."));
    assert.equal(prompt.includes("you can't go there"), false);
  });

  test("still refuses addresses on a map without sources", () => {
    const config = mapConfig();
    const plain = buildSystemPrompt(
      buildUserCatalog(
        buildCatalog("demo", config, layersStore()),
        walkMapConfig(config)
      )
    );
    assert.ok(plain.includes("you can't go there"));
    assert.equal(plain.includes("search_features"), false);
  });

  test("stays the same, as prompt caching relies on it", () => {
    assert.equal(buildSystemPrompt(view()), prompt);
  });
});
