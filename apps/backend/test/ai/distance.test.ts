import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { distanceBetween } from "../../server/apis/v2/services/ai/features/distance.ts";
import type {
  Geometry,
  Position,
} from "../../server/apis/v2/services/ai/features/geojson.ts";

const point = (x: number, y: number): Geometry => ({
  type: "Point",
  coordinates: [x, y],
});

const line = (...coordinates: Position[]): Geometry => ({
  type: "LineString",
  coordinates,
});

/** A closed square ring around a center. */
const square = (x: number, y: number, half: number): Position[] => [
  [x - half, y - half],
  [x + half, y - half],
  [x + half, y + half],
  [x - half, y + half],
  [x - half, y - half],
];

const polygon = (...coordinates: Position[][]): Geometry => ({
  type: "Polygon",
  coordinates,
});

const donut = polygon(square(0, 0, 10), square(0, 0, 5));

/** Distance is symmetric, so every case is checked in both directions. */
const assertDistance = (a: Geometry, b: Geometry, expected: number) => {
  assert.equal(distanceBetween(a, b), expected);
  assert.equal(distanceBetween(b, a), expected);
};

describe("distanceBetween", () => {
  test("measures between points", () => {
    assertDistance(point(0, 0), point(3, 4), 5);
  });

  test("gives 0 for the same point", () => {
    assertDistance(point(1, 1), point(1, 1), 0);
  });

  test("measures to the nearest place on a line", () => {
    assertDistance(point(5, 3), line([0, 0], [10, 0]), 3);
  });

  test("measures to the end of a line, past its end", () => {
    assertDistance(point(13, 4), line([0, 0], [10, 0]), 5);
  });

  test("gives 0 for a point on a line", () => {
    assertDistance(point(5, 0), line([0, 0], [10, 0]), 0);
  });

  test("gives 0 for lines that cross, with no vertex near", () => {
    assertDistance(line([-9, 0], [9, 0]), line([0, -9], [0, 9]), 0);
  });

  test("gives 0 for lines that touch", () => {
    assertDistance(line([0, 0], [5, 0]), line([5, 0], [5, 5]), 0);
  });

  test("measures between parallel lines", () => {
    assertDistance(line([0, 0], [9, 0]), line([0, 2], [9, 2]), 2);
  });

  test("handles a line of one point length", () => {
    assertDistance(line([0, 0], [0, 0]), point(3, 4), 5);
  });

  test("measures from outside a polygon to its edge", () => {
    assertDistance(point(13, 0), polygon(square(0, 0, 10)), 3);
  });

  test("gives 0 for a point inside a polygon", () => {
    assertDistance(point(1, 1), polygon(square(0, 0, 10)), 0);
  });

  test("gives 0 for a point on the edge of a polygon", () => {
    assertDistance(point(10, 0), polygon(square(0, 0, 10)), 0);
  });

  test("gives 0 for a point on a corner of a polygon", () => {
    assertDistance(point(10, 10), polygon(square(0, 0, 10)), 0);
  });

  test("measures from a point in a hole to the edge of the hole", () => {
    assertDistance(point(1, 0), donut, 4);
  });

  test("gives 0 for a point between a hole and the outer edge", () => {
    assertDistance(point(7, 0), donut, 0);
  });

  test("gives 0 for a line fully inside a polygon", () => {
    assertDistance(line([-1, 0], [1, 0]), polygon(square(0, 0, 10)), 0);
  });

  test("gives 0 for a line crossing a polygon", () => {
    assertDistance(line([-20, 0], [20, 0]), polygon(square(0, 0, 10)), 0);
  });

  test("gives 0 for a polygon inside another", () => {
    assertDistance(polygon(square(0, 0, 2)), polygon(square(0, 0, 10)), 0);
  });

  test("gives 0 for polygons that overlap", () => {
    assertDistance(polygon(square(0, 0, 5)), polygon(square(8, 0, 5)), 0);
  });

  test("gives 0 for polygons that share an edge", () => {
    assertDistance(polygon(square(0, 0, 5)), polygon(square(10, 0, 5)), 0);
  });

  test("measures between separate polygons", () => {
    assertDistance(polygon(square(0, 0, 5)), polygon(square(20, 0, 5)), 10);
  });

  test("measures from a polygon in a hole to the edge of the hole", () => {
    assertDistance(polygon(square(0, 0, 1)), donut, 4);
  });

  test("uses the nearest part of a Multi geometry", () => {
    const points: Geometry = {
      type: "MultiPoint",
      coordinates: [
        [100, 100],
        [3, 4],
      ],
    };
    const lines: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [50, 0],
          [60, 0],
        ],
        [
          [0, 2],
          [0, 9],
        ],
      ],
    };
    const polygons: Geometry = {
      type: "MultiPolygon",
      coordinates: [[square(100, 0, 1)], [square(10, 0, 1)]],
    };
    assertDistance(point(0, 0), points, 5);
    assertDistance(point(0, 0), lines, 2);
    assertDistance(point(0, 0), polygons, 9);
  });

  test("gives 0 for a point in any part of a MultiPolygon", () => {
    const polygons: Geometry = {
      type: "MultiPolygon",
      coordinates: [[square(100, 0, 1)], [square(0, 0, 1)]],
    };
    assertDistance(point(0, 0), polygons, 0);
  });

  /** A closed ring of many short segments, to give the search something to skip. */
  const circle = (x: number, y: number, radius: number, count: number) => {
    const ring = Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
    });
    return polygon([...ring, ring[0]]);
  };

  /** Every segment against every segment, which is what the search must match. */
  const bruteForce = (a: Position[], b: Position[]) => {
    let shortest = Infinity;
    for (let i = 1; i < a.length; i++) {
      for (let j = 1; j < b.length; j++) {
        for (const [p, s, e] of [
          [a[i], b[j - 1], b[j]],
          [a[i - 1], b[j - 1], b[j]],
          [b[j], a[i - 1], a[i]],
          [b[j - 1], a[i - 1], a[i]],
        ]) {
          const dx = e[0] - s[0];
          const dy = e[1] - s[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / (dx * dx + dy * dy)
            )
          );
          shortest = Math.min(
            shortest,
            Math.hypot(p[0] - s[0] - t * dx, p[1] - s[1] - t * dy)
          );
        }
      }
    }
    return shortest;
  };

  test("finds the same distance as comparing every segment", () => {
    const big = circle(0, 0, 1000, 300);
    for (const [x, y, radius] of [
      [1500, 0, 100],
      [0, -1300, 250],
      [900, 900, 150],
      [-1200, 700, 40],
    ]) {
      const small = circle(x, y, radius, 37);
      const [bigRing, smallRing] = [big, small].map(
        (g) => g.coordinates[0] as Position[]
      );
      const expected = bruteForce(bigRing, smallRing);
      assert.ok(Math.abs(distanceBetween(big, small) - expected) < 1e-6);
      assert.ok(Math.abs(distanceBetween(small, big) - expected) < 1e-6);
    }
  });

  test("stays fast for a large polygon against many others", () => {
    const big = circle(0, 0, 1000, 5000);
    const others = Array.from({ length: 250 }, (_, i) =>
      circle(3000 + i * 50, 0, 20, 100)
    );
    const start = performance.now();
    others.forEach((other) => distanceBetween(big, other));
    // Comparing every pair takes over 10 seconds. The margin is for slow machines.
    assert.ok(performance.now() - start < 2000);
  });

  test("ignores heights", () => {
    assertDistance(
      { type: "Point", coordinates: [0, 0, 50] },
      { type: "Point", coordinates: [3, 4, 0] },
      5
    );
  });

  test("gives Infinity for an empty geometry", () => {
    assertDistance(
      point(0, 0),
      { type: "MultiPoint", coordinates: [] },
      Infinity
    );
    assertDistance(point(0, 0), { type: "Polygon", coordinates: [] }, Infinity);
    assertDistance(
      point(0, 0),
      { type: "LineString", coordinates: [] },
      Infinity
    );
  });
});
