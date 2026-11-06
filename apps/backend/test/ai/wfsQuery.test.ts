import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { Geometry } from "../../server/apis/v2/services/ai/features/geojson.ts";
import {
  buildFilter,
  buildGetFeature,
  buildResourceIdFilter,
  escapeLike,
  escapeXml,
  geometryToGml,
} from "../../server/apis/v2/services/ai/features/wfsQuery.ts";
import type {
  FeatureFilter,
  FilterOp,
} from "../../server/apis/v2/services/ai/features/wfsQuery.ts";

const target = {
  typeName: "ws:adress",
  geometryField: "geom",
  srsName: "EPSG:3007",
  searchFields: ["sok"],
};

const filter = (overrides: Partial<FeatureFilter>, source = target) =>
  buildFilter(
    { text: null, filters: [], hasValue: null, near: null, ...overrides },
    source
  );

const point: Geometry = { type: "Point", coordinates: [1, 2] };

const LIKE_ATTRIBUTES =
  'wildCard="*" singleChar="~" escapeChar="!" matchCase="false"';

describe("escapeXml", () => {
  test("escapes all five special characters", () => {
    assert.equal(
      escapeXml(`<a b="c" d='e'>&`),
      "&lt;a b=&quot;c&quot; d=&apos;e&apos;&gt;&amp;"
    );
  });
});

describe("escapeLike", () => {
  test("escapes the wildcard, the single character and the escape", () => {
    assert.equal(escapeLike("a*b~c!d"), "a!*b!~c!!d");
  });

  test("leaves everything else alone, among them dots (#1844)", () => {
    assert.equal(
      escapeLike("St. Görans väg 4:1 %_?"),
      "St. Görans väg 4:1 %_?"
    );
  });

  test("doubles backslashes", () => {
    assert.equal(escapeLike("a\\b"), "a\\\\b");
  });
});

describe("buildFilter", () => {
  test("is empty when nothing limits the query", () => {
    assert.equal(filter({}), "");
  });

  test("treats blank text as no text", () => {
    assert.equal(filter({ text: "   " }), "");
  });

  test("matches text as one phrase, with wildcards at both ends", () => {
    assert.equal(
      filter({ text: " Kungsgatan 12 " }),
      `<fes:Filter><fes:PropertyIsLike ${LIKE_ATTRIBUTES}><fes:ValueReference>sok</fes:ValueReference><fes:Literal>*Kungsgatan 12*</fes:Literal></fes:PropertyIsLike></fes:Filter>`
    );
  });

  test("searches several fields with Or", () => {
    const xml = filter(
      { text: "a" },
      { ...target, searchFields: ["namn", "beteckning"] }
    );
    assert.match(xml, /^<fes:Filter><fes:Or><fes:PropertyIsLike/);
    assert.match(xml, /<fes:ValueReference>namn</);
    assert.match(xml, /<fes:ValueReference>beteckning</);
  });

  test("escapes wildcards in text, so they only match themselves", () => {
    assert.match(filter({ text: "100*" }), /<fes:Literal>\*100!\*\*</);
  });

  test("can't be broken out of with text", () => {
    const attack = `</fes:Literal></fes:PropertyIsLike></fes:Filter><x y="1">&`;
    const xml = filter({ text: attack });
    assert.equal(xml.includes("<x "), false);
    assert.equal(xml.match(/<\/fes:Filter>/g)?.length, 1);
    assert.match(xml, /&lt;x y=&quot;1&quot;&gt;&amp;/);
  });

  test("can't be broken out of with a field or a filter value", () => {
    const xml = filter({
      filters: [{ field: "a><b", op: "eq", value: "</fes:Literal><c>" }],
    });
    assert.equal(xml.includes("<b"), false);
    assert.equal(xml.includes("<c>"), false);
  });

  const operators: Array<[FilterOp, string]> = [
    ["eq", "PropertyIsEqualTo"],
    ["ne", "PropertyIsNotEqualTo"],
    ["lt", "PropertyIsLessThan"],
    ["lte", "PropertyIsLessThanOrEqualTo"],
    ["gt", "PropertyIsGreaterThan"],
    ["gte", "PropertyIsGreaterThanOrEqualTo"],
  ];

  for (const [op, element] of operators) {
    test(`writes ${op} without regard to case`, () => {
      assert.equal(
        filter({ filters: [{ field: "djup", op, value: "40" }] }),
        `<fes:Filter><fes:${element} matchCase="false"><fes:ValueReference>djup</fes:ValueReference><fes:Literal>40</fes:Literal></fes:${element}></fes:Filter>`
      );
    });
  }

  test("treats like as contains, with the value escaped", () => {
    const xml = filter({ filters: [{ field: "a", op: "like", value: "b*" }] });
    assert.ok(xml.includes(`<fes:PropertyIsLike ${LIKE_ATTRIBUTES}>`));
    assert.match(xml, /<fes:Literal>\*b!\*\*</);
  });

  test("leaves out features without a value in a field", () => {
    assert.equal(
      filter({ hasValue: "djup" }),
      "<fes:Filter><fes:Not><fes:PropertyIsNull><fes:ValueReference>djup</fes:ValueReference></fes:PropertyIsNull></fes:Not></fes:Filter>"
    );
  });

  test("uses Intersects for a distance of 0", () => {
    const xml = filter({ near: { geometry: point, distance: 0 } });
    assert.match(
      xml,
      /^<fes:Filter><fes:Intersects><fes:ValueReference>geom<\/fes:ValueReference><gml:Point/
    );
    assert.equal(xml.includes("Distance"), false);
  });

  test("uses DWithin in metres otherwise", () => {
    const xml = filter({ near: { geometry: point, distance: 1000 } });
    assert.match(xml, /^<fes:Filter><fes:DWithin>/);
    assert.match(xml, /<fes:Distance uom="m">1000<\/fes:Distance>/);
  });

  test("takes the projection of a spatial filter from the source", () => {
    const xml = filter({ near: { geometry: point, distance: 0 } });
    assert.match(xml, /<gml:Point srsName="EPSG:3007">/);
  });

  test("combines everything with And", () => {
    const xml = filter({
      text: "a",
      filters: [{ field: "b", op: "gt", value: "1" }],
      hasValue: "c",
      near: { geometry: point, distance: 5 },
    });
    assert.match(xml, /^<fes:Filter><fes:And><fes:PropertyIsLike/);
    assert.match(xml, /<fes:PropertyIsGreaterThan/);
    assert.match(xml, /<fes:Not>/);
    assert.match(
      xml,
      /<fes:DWithin>.*<\/fes:DWithin><\/fes:And><\/fes:Filter>$/
    );
  });
});

describe("geometryToGml", () => {
  const ring = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 0],
  ];
  const hole = [
    [1, 1],
    [2, 1],
    [2, 2],
    [1, 1],
  ];
  const gml = (geometry: Geometry) => geometryToGml(geometry, "EPSG:3007");
  const SRS = 'srsName="EPSG:3007"';
  const RING = "0 0 4 0 4 4 0 0";
  const HOLE = "1 1 2 1 2 2 1 1";

  test("writes a Point", () => {
    assert.equal(
      gml(point),
      `<gml:Point ${SRS}><gml:pos>1 2</gml:pos></gml:Point>`
    );
  });

  test("writes a LineString", () => {
    assert.equal(
      gml({
        type: "LineString",
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      }),
      `<gml:LineString ${SRS}><gml:posList>1 2 3 4</gml:posList></gml:LineString>`
    );
  });

  test("writes a Polygon", () => {
    assert.equal(
      gml({ type: "Polygon", coordinates: [ring] }),
      `<gml:Polygon ${SRS}><gml:exterior><gml:LinearRing><gml:posList>${RING}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon>`
    );
  });

  test("writes the holes of a Polygon", () => {
    assert.equal(
      gml({ type: "Polygon", coordinates: [ring, hole] }),
      `<gml:Polygon ${SRS}><gml:exterior><gml:LinearRing><gml:posList>${RING}</gml:posList></gml:LinearRing></gml:exterior><gml:interior><gml:LinearRing><gml:posList>${HOLE}</gml:posList></gml:LinearRing></gml:interior></gml:Polygon>`
    );
  });

  test("writes a MultiPoint", () => {
    assert.equal(
      gml({
        type: "MultiPoint",
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      }),
      `<gml:MultiPoint ${SRS}><gml:pointMember><gml:Point><gml:pos>1 2</gml:pos></gml:Point></gml:pointMember><gml:pointMember><gml:Point><gml:pos>3 4</gml:pos></gml:Point></gml:pointMember></gml:MultiPoint>`
    );
  });

  test("writes a MultiLineString", () => {
    assert.equal(
      gml({
        type: "MultiLineString",
        coordinates: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      }),
      `<gml:MultiCurve ${SRS}><gml:curveMember><gml:LineString><gml:posList>1 2 3 4</gml:posList></gml:LineString></gml:curveMember></gml:MultiCurve>`
    );
  });

  test("writes a MultiPolygon, with holes", () => {
    const xml = gml({
      type: "MultiPolygon",
      coordinates: [[ring, hole], [ring]],
    });
    assert.match(
      xml,
      new RegExp(`^<gml:MultiSurface ${SRS}><gml:surfaceMember><gml:Polygon>`)
    );
    assert.equal(xml.match(/<gml:surfaceMember>/g)?.length, 2);
    assert.equal(xml.match(/<gml:interior>/g)?.length, 1);
  });

  test("drops heights, as the list of positions is two-dimensional", () => {
    assert.match(
      gml({ type: "Point", coordinates: [1, 2, 3] }),
      /<gml:pos>1 2<\/gml:pos>/
    );
  });

  test("escapes what comes from a response", () => {
    const xml = gml({
      type: "Point",
      coordinates: ["<x>", 2],
    } as unknown as Geometry);
    assert.equal(xml.includes("<x>"), false);
  });

  test("rejects other types", () => {
    assert.throws(
      () => gml({ type: "GeometryCollection" } as unknown as Geometry),
      /GeometryCollection/
    );
  });
});

describe("buildGetFeature", () => {
  const request = (overrides = {}) =>
    buildGetFeature(target, {
      filter: "",
      sort: null,
      count: 250,
      ...overrides,
    });

  test("asks for JSON in the projection of the source", () => {
    const xml = request();
    assert.match(xml, /^<wfs:GetFeature service="WFS" version="2\.0\.0"/);
    assert.match(xml, /outputFormat="application\/json"/);
    assert.match(xml, /count="250"/);
    assert.match(xml, /<wfs:Query typeNames="ws:adress" srsName="EPSG:3007">/);
  });

  test("uses a count of 0 for counting, as hits answers in XML", () => {
    const xml = request({ count: 0 });
    assert.match(xml, /count="0"/);
    assert.equal(xml.includes("resultType"), false);
  });

  test("puts the filter before the sorting", () => {
    assert.match(
      request({
        filter: "<fes:Filter/>",
        sort: { field: "djup", descending: true },
      }),
      /<fes:Filter\/><fes:SortBy><fes:SortProperty><fes:ValueReference>djup<\/fes:ValueReference><fes:SortOrder>DESC<\/fes:SortOrder><\/fes:SortProperty><\/fes:SortBy><\/wfs:Query>/
    );
  });

  test("sorts ascending unless told otherwise", () => {
    assert.match(
      request({ sort: { field: "a", descending: false } }),
      /<fes:SortOrder>ASC</
    );
  });

  test("escapes the type name and the projection", () => {
    const xml = buildGetFeature(
      { ...target, typeName: 'a"b', srsName: "c<d" },
      { filter: "", sort: null, count: 1 }
    );
    assert.match(xml, /typeNames="a&quot;b" srsName="c&lt;d"/);
  });
});

describe("buildResourceIdFilter", () => {
  test("addresses one feature", () => {
    assert.equal(
      buildResourceIdFilter("adresspunkt.1"),
      '<fes:Filter><fes:ResourceId rid="adresspunkt.1"/></fes:Filter>'
    );
  });

  test("escapes the id", () => {
    assert.match(buildResourceIdFilter('a"/>'), /rid="a&quot;\/&gt;"/);
  });
});
