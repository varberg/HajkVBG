import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import {
  CatalogService,
  buildCatalog,
  cleanHtml,
  cleanInline,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import type { ConfigSource } from "../../server/apis/v2/services/ai/catalog.service.ts";
import { layersStore, mapConfig } from "./fixtures.ts";

// Run with: npm test (loads .env.example, so the logger has what it needs)

const serviceUrl = new URL(
  "../../server/apis/v2/services/ai/catalog.service.ts",
  import.meta.url
).href;
const catalog = () => buildCatalog("demo", mapConfig(), layersStore());
const record = (id: string) => catalog().recordsById.get(id)!;

describe("cleanHtml", () => {
  test("strips tags and keeps line breaks", () => {
    assert.equal(cleanHtml("<p>Ett</p><br/>två <b>tre</b>"), "Ett\n\ntvå tre");
  });

  test("removes scripts, styles and comments with their contents", () => {
    assert.equal(
      cleanHtml("a<script>x()</script>b<style>p{}</style>c<!-- d -->"),
      "a b c"
    );
  });

  test("decodes entities once, so escaped text stays escaped", () => {
    assert.equal(cleanHtml("R&amp;D &#229; &#xe4; &amp;lt;"), "R&D å ä &lt;");
  });

  test("leaves unknown entities and lone angle brackets alone", () => {
    assert.equal(cleanHtml("a < b &unknown; &#0;"), "a < b &unknown; &#0;");
  });

  test("converts empty, blank and non-string values to null", () => {
    for (const value of ["", "   ", "<p> </p>", null, undefined, 5]) {
      assert.equal(cleanHtml(value), null);
    }
  });
});

describe("cleanInline", () => {
  test("puts everything on one line", () => {
    assert.equal(cleanInline("Ett<br>två\n  tre"), "Ett två tre");
  });
});

describe("walkMapConfig", () => {
  test("gives every layer its full group path", () => {
    const place = walkMapConfig(mapConfig()).tree.find(
      (l) => l.id === "group"
    )!;
    assert.deepEqual(place.groupPath, ["Planering", "Detaljer"]);
    assert.equal(place.groupId, "nested");
  });

  test("handles a config without the expected tools", () => {
    const walked = walkMapConfig({ tools: [] });
    assert.deepEqual(walked.tree, []);
    assert.deepEqual(walked.groups, []);
    assert.deepEqual(walkMapConfig({}).search, []);
  });

  test("marks the tools the chat can open, without any other options", () => {
    const { info } = walkMapConfig({
      tools: [
        { type: "Sketch", options: { target: "toolbar", secret: "x" } },
        { type: "print", options: { target: "left", title: "Utskrift" } },
        { type: "measurer", options: { target: "hidden" } },
        { type: "bookmarks", options: {} },
        { type: "search", options: { target: "toolbar" } },
        { type: "custom", options: { target: "toolbar" } },
      ],
    });

    assert.deepEqual(info.tools, [
      { type: "sketch", title: "Rita", openable: true },
      { type: "print", title: "Utskrift", openable: true },
      { type: "measurer", title: "Mät", openable: false },
      { type: "bookmarks", title: "Bokmärken", openable: false },
      { type: "search", title: "search", openable: false },
      { type: "custom", title: "custom", openable: false },
    ]);
  });

  test("accepts plain ids as well as objects", () => {
    const walked = walkMapConfig({
      tools: [
        {
          type: "layerswitcher",
          options: { groups: [{ id: "g", layers: ["a", 7] }] },
        },
      ],
    });
    assert.deepEqual(
      walked.tree.map((l) => l.id),
      ["a", "7"]
    );
  });
});

describe("buildCatalog", () => {
  test("gives each used layer one record, and leaves out unused ones", () => {
    const { records, recordsById } = catalog();
    assert.equal(records.length, recordsById.size);
    assert.equal(recordsById.has("unused"), false);
  });

  test("assigns roles", () => {
    assert.equal(record("plain").role, "layer");
    assert.equal(record("multiBackground").role, "background");
    assert.equal(record("wfs1").role, "search");
  });

  test("tree role wins over Search, with searchable set", () => {
    assert.equal(record("both").role, "layer");
    assert.equal(record("both").searchable, true);
    assert.equal(record("plain").searchable, false);
  });

  test("reads all six store types", () => {
    const types = Object.fromEntries(
      ["plain", "wmts1", "wfs1", "wfst1", "vector1", "arcgis1"].map((id) => [
        id,
        record(id).type,
      ])
    );
    assert.deepEqual(types, {
      plain: "wms",
      wmts1: "wmts",
      wfs1: "wfs",
      wfst1: "wfst",
      vector1: "vector",
      arcgis1: "arcgis",
    });
  });

  test("adds only the enabled built-in backgrounds", () => {
    const builtIn = catalog().records.filter((r) => r.type === "builtin");
    assert.deepEqual(
      builtIn.map((r) => [r.id, r.caption, r.role]),
      [
        ["-1", "Vit", "background"],
        ["-3", "OpenStreetMap", "background"],
      ]
    );
  });

  test("skips dangling ids, in records and in group leaves", () => {
    const result = catalog();
    assert.equal(result.recordsById.has("dangling"), false);
    const broken = result.groups.find((g) => g.id === "broken")!;
    assert.deepEqual(broken.leafLayerIds, []);
  });

  test("detects group layers from the number of sublayers", () => {
    assert.equal(record("group").isGroupLayer, true);
    assert.equal(record("plain").isGroupLayer, false);
  });

  test("a background with several sublayers stays a background", () => {
    assert.equal(record("multiBackground").isGroupLayer, false);
    assert.equal(record("multiBackground").subLayersToggleable, false);
  });

  test("a search-only layer with several sublayers is no group layer", () => {
    assert.equal(record("searchWms").isGroupLayer, false);
  });

  test("hideExpandArrow makes sublayers non-toggleable, but stays a group", () => {
    assert.equal(record("group").subLayersToggleable, true);
    assert.equal(record("hiddenSubs").isGroupLayer, true);
    assert.equal(record("hiddenSubs").subLayersToggleable, false);
  });

  test("pairs sublayers with captions, using null for a missing one", () => {
    assert.deepEqual(record("group").subLayers, [
      { id: "sub_a", caption: "Sublager A" },
      { id: "sub_b", caption: null },
    ]);
  });

  test("reads the owner from infoOwner", () => {
    assert.equal(record("plain").owner, "Stadsbyggnad");
    assert.equal(record("sameCaption").owner, null);
  });

  test("converts empty values to null", () => {
    const { infoUrl, contentTag } = record("sameCaption");
    assert.deepEqual([infoUrl, contentTag], [null, null]);
  });

  test("formats epoch dates and handles missing ones", () => {
    assert.equal(record("plain").date, "2022-05-04");
    assert.equal(record("wfs1").date, null);
  });

  test("adds the info of all parent groups to the text", () => {
    assert.equal(
      record("plain").text,
      "Första raden\n\nAndra raden\n\nOm planering"
    );
    assert.equal(record("sameCaption").text, "Om planering");
  });

  test("keeps duplicate captions apart through the group path", () => {
    const a = record("plain");
    const b = record("sameCaption");
    assert.equal(a.caption, b.caption);
    assert.notDeepEqual(a.groupPath, b.groupPath);
  });

  test("indexes groups with all their leaves", () => {
    const top = catalog().groups.find((g) => g.id === "top")!;
    assert.deepEqual(top.groupPath, ["Planering"]);
    assert.equal(top.parentId, null);
    assert.equal(top.exclusive, false);
    assert.deepEqual(top.leafLayerIds, [
      "plain",
      "wmts1",
      "arcgis1",
      "sameCaption",
      "group",
      "hiddenSubs",
    ]);
  });

  test("carries the exclusive flag and the parent", () => {
    const nested = catalog().groups.find((g) => g.id === "nested")!;
    assert.equal(nested.exclusive, true);
    assert.equal(nested.parentId, "top");
  });

  test("records hold only allowlisted fields", () => {
    const allowed = [
      "caption",
      "contentTag",
      "date",
      "groupId",
      "groupPath",
      "id",
      "infoUrl",
      "isGroupLayer",
      "owner",
      "role",
      "searchable",
      "subLayers",
      "subLayersToggleable",
      "text",
      "type",
    ];
    for (const r of catalog().records) {
      assert.deepEqual(Object.keys(r).sort(), allowed);
    }
  });

  test("no connection details or tool options reach the catalog", () => {
    const { records, groups } = catalog();
    const output = JSON.stringify({ records, groups });
    assert.equal(output.includes("secret.example.com"), false);
    assert.equal(output.includes("https://secret"), false);
    assert.equal(output.includes("do not expose"), false);
  });
});

describe("CatalogService", () => {
  let dir: string;
  let reads: number;
  let failNextRead: Error | null;

  const config: ConfigSource = {
    getMapConfig: async () => {
      reads += 1;
      if (failNextRead) {
        const error = failNextRead;
        failNextRead = null;
        return { error };
      }
      return mapConfig();
    },
    getLayersStore: async () => layersStore(),
  };

  const touch = (file: string, content = "{}") =>
    fs.writeFileSync(path.join(dir, file), content);

  const newService = () => {
    reads = 0;
    failNextRead = null;
    return new CatalogService({ config, appDataDir: dir });
  };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hajk-ai-catalog-"));
    touch("demo.json");
    touch("layers.json");
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("reads the files once while they are unchanged", async () => {
    const service = newService();
    const first = await service.getCatalog("demo");
    assert.equal(await service.getCatalog("demo"), first);
    assert.equal(reads, 1);
  });

  test("shares one build between concurrent requests", async () => {
    const service = newService();
    await Promise.all([service.getCatalog("demo"), service.getCatalog("demo")]);
    assert.equal(reads, 1);
  });

  test("rebuilds when the map or the layers store changes", async () => {
    const service = newService();
    await service.getCatalog("demo");
    touch("demo.json", '{"changed":1}');
    await service.getCatalog("demo");
    assert.equal(reads, 2);
    touch("layers.json", '{"changed":1}');
    await service.getCatalog("demo");
    assert.equal(reads, 3);
  });

  test("doesn't cache a failed build", async () => {
    const service = newService();
    failNextRead = new Error("Half written file");
    await assert.rejects(service.getCatalog("demo"), /Half written/);
    assert.equal((await service.getCatalog("demo")).map, "demo");
  });

  test("rejects an unsafe map name before touching any file", async () => {
    const service = newService();
    await assert.rejects(service.getCatalog("../demo"), { statusCode: 400 });
    assert.equal(reads, 0);
  });

  test("fails with ENOENT for a map that doesn't exist", async () => {
    await assert.rejects(newService().getCatalog("missing"), {
      code: "ENOENT",
    });
  });

  test("the watcher reports map changes, but not other files", async () => {
    const service = newService();
    await service.startWatching();
    try {
      const changed = new Promise<string>((resolve) => {
        const stop = service.onChange((file) => {
          stop();
          resolve(file);
        });
      });
      fs.mkdirSync(path.join(dir, "ai-cache"), { recursive: true });
      touch("notes.txt");
      touch("demo.json", '{"watched":1}');
      assert.equal(await changed, "demo.json");
    } finally {
      await service.stopWatching();
    }
  });

  test("the watcher doesn't keep the process alive", async () => {
    // Shutdown only closes the server, so an active handle stops the process
    // from exiting on SIGTERM
    const script = `
      const { CatalogService } = await import(${JSON.stringify(serviceUrl)});
      await new CatalogService({ appDataDir: ${JSON.stringify(dir)} }).startWatching();
    `;
    await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "--eval", script],
      { timeout: 15000 }
    );
  });
});
