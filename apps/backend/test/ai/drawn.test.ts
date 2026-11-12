import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildUserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import type { RawMapConfig } from "../../server/apis/v2/services/ai/catalog.service.ts";
import {
  MAX_DRAWN,
  MAX_DRAWN_VERTICES,
  describeDrawn,
  sanitizeDrawn,
} from "../../server/apis/v2/services/ai/features/drawn.ts";
import {
  renderMapState,
  sanitizeMapState,
} from "../../server/apis/v2/services/ai/mapState.ts";
import { featureMapConfig, featureStore } from "./fixtures.ts";

const EXTENT = [150000, 6315000, 200000, 6360000];

const square = (x = 160000, y = 6330000, size = 100) => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

const drawn = (id: string, geometry: object, title?: unknown) => ({
  id,
  geometry,
  ...(title !== undefined && { title }),
});

describe("sanitizeDrawn", () => {
  test("keeps valid features of every kind, rebuilt from checked parts", () => {
    const { features, skipped } = sanitizeDrawn(
      [
        drawn("s1", square(), "Mitt område"),
        drawn("s2", { type: "Point", coordinates: [160000, 6330000, 12] }),
        drawn("s3", {
          type: "LineString",
          coordinates: [
            [160000, 6330000],
            [160300, 6330400],
          ],
          extra: "dropped",
        }),
        drawn("s4", {
          type: "MultiPolygon",
          coordinates: [square().coordinates, square(161000).coordinates],
        }),
      ],
      EXTENT
    );
    assert.equal(skipped, 0);
    assert.deepEqual(
      features.map((f) => [f.id, f.geometry.type]),
      [
        ["s1", "Polygon"],
        ["s2", "Point"],
        ["s3", "LineString"],
        ["s4", "MultiPolygon"],
      ]
    );
    // Heights are dropped, and nothing but type and coordinates is kept
    assert.deepEqual(features[1].geometry.coordinates, [160000, 6330000]);
    assert.deepEqual(Object.keys(features[2].geometry), [
      "type",
      "coordinates",
    ]);
    assert.equal(features[0].title, "Mitt område");
  });

  test("closes a ring that isn't closed", () => {
    const open = {
      type: "Polygon",
      coordinates: [
        [
          [160000, 6330000],
          [160100, 6330000],
          [160100, 6330100],
        ],
      ],
    };
    const [feature] = sanitizeDrawn([drawn("s1", open)], EXTENT).features;
    const ring = (feature.geometry.coordinates as number[][][])[0];
    assert.equal(ring.length, 4);
    assert.deepEqual(ring[3], ring[0]);
  });

  test("skips what can't be trusted", () => {
    const bad = [
      drawn("1", square()),
      drawn("s1; DROP", square()),
      drawn("adress.1", square()),
      drawn("s2", { type: "Circle", center: [160000, 6330000], radius: 5 }),
      drawn("s3", { type: "Point", coordinates: [Infinity, 6330000] }),
      drawn("s4", { type: "Point", coordinates: ["160000", 6330000] }),
      drawn("s5", { type: "LineString", coordinates: [[160000, 6330000]] }),
      // Lon/lat, so the wrong projection
      drawn("s6", { type: "Point", coordinates: [12.25, 57.1] }),
      drawn("s7", { type: "GeometryCollection", geometries: [] }),
      null,
      "s8",
    ];
    const { features, skipped } = sanitizeDrawn(bad, EXTENT);
    assert.deepEqual(features, []);
    assert.equal(skipped, bad.length);
  });

  test("keeps the first of two features with the same id", () => {
    const { features, skipped } = sanitizeDrawn(
      [drawn("s1", square(), "A"), drawn("s1", square(), "B")],
      EXTENT
    );
    assert.deepEqual(
      features.map((f) => f.title),
      ["A"]
    );
    assert.equal(skipped, 1);
  });

  test("allows drawings a bit outside the map, and anywhere without an extent", () => {
    const outside = drawn("s1", square(EXTENT[2] + 5000));
    assert.equal(sanitizeDrawn([outside], EXTENT).features.length, 1);
    const far = drawn("s2", { type: "Point", coordinates: [12.25, 57.1] });
    assert.equal(sanitizeDrawn([far], null).features.length, 1);
  });

  test("keeps the number of features and vertices within the limits", () => {
    const many = Array.from({ length: MAX_DRAWN + 3 }, (_, i) =>
      drawn(`s${i + 1}`, square())
    );
    const counted = sanitizeDrawn(many, EXTENT);
    assert.equal(counted.features.length, MAX_DRAWN);
    assert.equal(counted.skipped, 3);

    const line = (n: number) => ({
      type: "LineString",
      coordinates: Array.from({ length: n }, (_, i) => [160000 + i, 6330000]),
    });
    const heavy = sanitizeDrawn(
      [
        drawn("s1", line(MAX_DRAWN_VERTICES - 10)),
        drawn("s2", line(20)),
        drawn("s3", line(10)),
      ],
      EXTENT
    );
    assert.deepEqual(
      heavy.features.map((f) => f.id),
      ["s1", "s3"]
    );
    assert.equal(heavy.skipped, 1);
  });

  test("makes a title plain text on one line, and short", () => {
    const titles = sanitizeDrawn(
      [
        drawn("s1", square(), "  <b>Område</b>\n\tett  "),
        drawn("s2", square(), "x".repeat(200)),
        drawn("s3", square(), "   "),
        drawn("s4", square(), 42),
      ],
      EXTENT
    ).features.map((f) => f.title);
    assert.equal(titles[0], "b Område /b ett");
    assert.equal(titles[1]?.length, 60);
    assert.equal(titles[2], null);
    assert.equal(titles[3], null);
  });
});

describe("describeDrawn", () => {
  test("gives kind and size, and never coordinates", () => {
    const [area, line, place] = sanitizeDrawn(
      [
        drawn("s1", square(160000, 6330000, 100), "Tomten"),
        drawn("s2", {
          type: "LineString",
          coordinates: [
            [160000, 6330000],
            [160300, 6330400],
          ],
        }),
        drawn("s3", { type: "Point", coordinates: [160000, 6330000] }),
      ],
      EXTENT
    ).features.map(describeDrawn);
    assert.deepEqual(area, {
      id: "s1",
      title: "Tomten",
      kind: "area",
      areaM2: 10000,
    });
    assert.deepEqual(line, { id: "s2", kind: "line", lengthM: 500 });
    assert.deepEqual(place, { id: "s3", kind: "point" });
  });

  test("leaves out the area of a hole", () => {
    const withHole = {
      type: "Polygon",
      coordinates: [
        square(160000, 6330000, 100).coordinates[0],
        square(160025, 6330025, 50).coordinates[0],
      ],
    };
    const [feature] = sanitizeDrawn([drawn("s1", withHole)], EXTENT).features;
    assert.deepEqual(describeDrawn(feature), {
      id: "s1",
      kind: "area",
      areaM2: 7500,
    });
  });
});

describe("the map state and drawn features", () => {
  const catalogFor = (drawnFeatures?: boolean) => {
    const base = featureMapConfig();
    const config: RawMapConfig = {
      ...base,
      map: { ...base.map, extent: EXTENT },
      tools: base.tools.map((tool) =>
        tool.type === "aichat" && drawnFeatures !== undefined
          ? { ...tool, options: { ...tool.options, drawnFeatures } }
          : tool
      ),
    };
    return buildUserCatalog(
      buildCatalog("demo", config, featureStore()),
      walkMapConfig(config)
    );
  };

  const raw = {
    layers: [],
    background: null,
    drawn: [drawn("s1", square(), "Tomten"), drawn("s2", { type: "Circle" })],
  };

  test("are taken by default, checked against the map's extent", () => {
    const state = sanitizeMapState(raw, catalogFor(), "2026-11-11");
    assert.deepEqual(
      state.drawn.map((f) => f.id),
      ["s1"]
    );
    assert.equal(state.drawnSkipped, 1);
  });

  test("are ignored on a map that turns them off", () => {
    const state = sanitizeMapState(raw, catalogFor(false), "2026-11-11");
    assert.deepEqual(state.drawn, []);
    assert.equal(state.drawnSkipped, 0);
  });

  test("reach the model as kind and size, with the date and the skipped count", () => {
    const catalog = catalogFor();
    const rendered = JSON.parse(
      renderMapState(sanitizeMapState(raw, catalog, "2026-11-11"), catalog)
    );
    assert.equal(rendered.today, "2026-11-11");
    assert.deepEqual(rendered.drawn, [
      { id: "s1", title: "Tomten", kind: "area", areaM2: 10000 },
    ]);
    assert.equal(rendered.drawnSkipped, 1);
  });

  test("are left out of the text when there are none", () => {
    const catalog = catalogFor();
    const rendered = JSON.parse(
      renderMapState(
        sanitizeMapState({ layers: [] }, catalog, "2026-11-11"),
        catalog
      )
    );
    assert.deepEqual(Object.keys(rendered), ["today", "layers", "background"]);
  });
});
