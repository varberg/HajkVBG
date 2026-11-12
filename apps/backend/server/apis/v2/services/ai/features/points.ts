import type { Geometry, Position } from "./geojson.ts";

const squaredDistance = (a: Position, b: Position) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** The vertex nearest the average of the ring, which is always on the area. */
function ringPoint(ring: Position[]): Position {
  const n = ring.length;
  const mean = [
    ring.reduce((sum, p) => sum + p[0], 0) / n,
    ring.reduce((sum, p) => sum + p[1], 0) / n,
  ];
  return ring.reduce((best, p) =>
    squaredDistance(p, mean) < squaredDistance(best, mean) ? p : best
  );
}

const middle = (line: Position[]): Position =>
  line[Math.floor(line.length / 2)];

/** @summary One point that stands for a feature, on or in its geometry. */
export function representativePoint(geometry: Geometry): Position {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates;
    case "MultiPoint":
      return geometry.coordinates[0];
    case "LineString":
      return middle(geometry.coordinates);
    case "MultiLineString":
      return middle(geometry.coordinates[0]);
    case "Polygon":
      return ringPoint(geometry.coordinates[0]);
    case "MultiPolygon":
      return ringPoint(geometry.coordinates[0][0]);
  }
}
