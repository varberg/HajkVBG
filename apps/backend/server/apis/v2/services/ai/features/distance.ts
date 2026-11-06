import type { Geometry, Position } from "./geojson.ts";

/** One point, line or polygon. A polygon has its rings as `lines`. */
interface Part {
  lines: Position[][];
  isArea: boolean;
}

function toParts(geometry: Geometry): Part[] {
  const { type, coordinates } = geometry;
  switch (type) {
    case "Point":
      return [{ lines: [[coordinates]], isArea: false }];
    case "MultiPoint":
      return coordinates.map((p) => ({ lines: [[p]], isArea: false }));
    case "LineString":
      return [{ lines: [coordinates], isArea: false }];
    case "MultiLineString":
      return coordinates.map((l) => ({ lines: [l], isArea: false }));
    case "Polygon":
      return [{ lines: coordinates, isArea: true }];
    case "MultiPolygon":
      return coordinates.map((rings) => ({ lines: rings, isArea: true }));
    default:
      return [];
  }
}

/** Even-odd over all rings, so a point in a hole is outside the polygon. */
function isInside([x, y]: Position, rings: Position[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [x1, y1] = ring[i - 1];
      const [x2, y2] = ring[i];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function pointToSegment([x, y]: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared;
  const t = Math.min(1, Math.max(0, along));
  return (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2;
}

const side = (a: Position, b: Position, c: Position): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** @returns The squared distance. Touching needs no test: an end is then 0 away. */
function segmentToSegment(
  a: Position,
  b: Position,
  c: Position,
  d: Position
): number {
  const crosses =
    side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  return crosses
    ? 0
    : Math.min(
        pointToSegment(a, c, d),
        pointToSegment(b, c, d),
        pointToSegment(c, a, b),
        pointToSegment(d, a, b)
      );
}

type Segment = [Position, Position];

// A single point counts as a segment of no length
const segmentsOf = ({ lines }: Part): Segment[] =>
  lines.flatMap((line) =>
    line.length === 1
      ? [[line[0], line[0]] as Segment]
      : line.slice(1).map((end, i) => [line[i], end] as Segment)
  );

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(segments: Segment[]): Box {
  const box = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const [[x1, y1], [x2, y2]] of segments) {
    box.minX = Math.min(box.minX, x1, x2);
    box.minY = Math.min(box.minY, y1, y2);
    box.maxX = Math.max(box.maxX, x1, x2);
    box.maxY = Math.max(box.maxY, y1, y2);
  }
  return box;
}

/** @returns The squared distance, which nothing inside the boxes can be below */
function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return dx * dx + dy * dy;
}

// Without crossing edges, one vertex tells where all of `inner` is
const holds = (outer: Part, inner: Part): boolean =>
  outer.isArea && isInside(inner.lines[0][0], outer.lines);

/**
 * @summary The squared distance between two parts, if it's below `limit`.
 * @description This runs on the event loop of the whole backend, and comparing
 * every pair takes seconds for a large polygon against 250 others. So the longer
 * part goes through its segments nearest first, which ends the search as soon as
 * no segment left can beat what has been found.
 */
function partDistance(a: Part, b: Part, limit: number): number {
  if (holds(a, b) || holds(b, a)) {
    return 0;
  }
  const [longer, shorter] = [segmentsOf(a), segmentsOf(b)].sort(
    (x, y) => y.length - x.length
  );
  const box = boxOf(shorter);
  const nearestFirst = longer
    .map((segment) => ({ segment, gap: gapBetween(boxOf([segment]), box) }))
    .sort((x, y) => x.gap - y.gap);

  let shortest = limit;
  for (const { segment, gap } of nearestFirst) {
    if (gap >= shortest) {
      break;
    }
    for (const [start, end] of shorter) {
      shortest = Math.min(
        shortest,
        segmentToSegment(segment[0], segment[1], start, end)
      );
      if (shortest === 0) {
        return 0;
      }
    }
  }
  return shortest;
}

const hasCoordinates = ({ lines }: Part): boolean => lines[0]?.length > 0;

/**
 * @summary The shortest distance between two geometries, in map units, which
 * like DWithin assumes a projection in metres. It's 0 if they touch or one is
 * inside the other.
 * @returns Infinity if a geometry is empty
 */
export function distanceBetween(a: Geometry, b: Geometry): number {
  const others = toParts(b).filter(hasCoordinates);
  let shortest = Infinity;
  for (const part of toParts(a).filter(hasCoordinates)) {
    for (const other of others) {
      shortest = partDistance(part, other, shortest);
    }
  }
  return Math.sqrt(shortest);
}
