import type { Geometry, Position } from "./geojson.ts";

/**
 * Features the user drew with Sketch and chose to share with the chat, sent
 * with the map state of each message. They only live for that message: the
 * model can use them wherever it takes a feature id, and only while they are in
 * the latest map state.
 */

/** The id the browser gives a drawn feature. Never a WFS id, which has a dot. */
export const DRAWN_ID = /^s\d{1,4}$/;

// Same limits as the browser, see drawnFeatures.ts in the AiChat plugin
export const MAX_DRAWN = 20;
export const MAX_DRAWN_VERTICES = 5000;
const MAX_TITLE = 60;
// Drawings may reach outside the map's extent, but not by much
const EXTENT_MARGIN_M = 100_000;

export interface DrawnFeature {
  id: string;
  /** The title the user gave it in Sketch, if any */
  title: string | null;
  /** In the map projection */
  geometry: Geometry;
}

type Check = (position: Position) => boolean;

const isPosition = (value: unknown, inside: Check): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
  inside(value as Position);

/** Only x and y, as nothing here uses a height */
const flat = (position: Position): Position => [position[0], position[1]];

function readLine(value: unknown, min: number, inside: Check) {
  if (!Array.isArray(value) || value.length < min) {
    return null;
  }
  return value.every((p) => isPosition(p, inside))
    ? (value as Position[]).map(flat)
    : null;
}

/** A ring is closed here, as OpenLayers doesn't always repeat the first point */
function readRing(value: unknown, inside: Check): Position[] | null {
  const ring = readLine(value, 3, inside);
  if (ring === null) {
    return null;
  }
  const [first, last] = [ring[0], ring[ring.length - 1]];
  const closed =
    first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  return closed.length >= 4 ? closed : null;
}

function readPolygon(value: unknown, inside: Check): Position[][] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const rings = value.map((ring) => readRing(ring, inside));
  return rings.every((ring) => ring !== null) ? rings : null;
}

const readList = <T>(
  value: unknown,
  read: (item: unknown) => T | null
): T[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const items = value.map(read);
  return items.every((item) => item !== null) ? (items as T[]) : null;
};

/** @returns The geometry, rebuilt from what was checked, or null if it's bad */
function readGeometry(value: unknown, inside: Check): Geometry | null {
  const { type, coordinates } = (value ?? {}) as {
    type?: unknown;
    coordinates?: unknown;
  };
  switch (type) {
    case "Point": {
      return isPosition(coordinates, inside)
        ? { type, coordinates: flat(coordinates) }
        : null;
    }
    case "MultiPoint": {
      const points = readList(coordinates, (p) =>
        isPosition(p, inside) ? flat(p) : null
      );
      return points && { type, coordinates: points };
    }
    case "LineString": {
      const line = readLine(coordinates, 2, inside);
      return line && { type, coordinates: line };
    }
    case "MultiLineString": {
      const lines = readList(coordinates, (l) => readLine(l, 2, inside));
      return lines && { type, coordinates: lines };
    }
    case "Polygon": {
      const rings = readPolygon(coordinates, inside);
      return rings && { type, coordinates: rings };
    }
    case "MultiPolygon": {
      const polygons = readList(coordinates, (p) => readPolygon(p, inside));
      return polygons && { type, coordinates: polygons };
    }
    default:
      return null;
  }
}

export function vertexCount(geometry: Geometry): number {
  const { coordinates } = geometry;
  switch (geometry.type) {
    case "Point":
      return 1;
    case "MultiPoint":
    case "LineString":
      return (coordinates as Position[]).length;
    case "MultiLineString":
    case "Polygon":
      return (coordinates as Position[][]).flat().length;
    case "MultiPolygon":
      return (coordinates as Position[][][]).flat(2).length;
  }
}

/** Plain text on one line, as it goes into the prompt */
function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, MAX_TITLE) || null;
}

function insideCheck(extent: number[] | null): Check {
  if (extent === null) {
    return () => true;
  }
  const [minX, minY, maxX, maxY] = extent;
  return ([x, y]) =>
    x >= minX - EXTENT_MARGIN_M &&
    x <= maxX + EXTENT_MARGIN_M &&
    y >= minY - EXTENT_MARGIN_M &&
    y <= maxY + EXTENT_MARGIN_M;
}

/**
 * @summary The drawn features of a map state, as far as they can be trusted.
 * @description The browser can send anything, so each feature is rebuilt from
 * checked parts: a known id, a geometry type that GeoJSON has, finite numbers
 * near the map, and a short title without markup. The limits keep a WFS filter
 * or a routing request from growing out of hand. What fails is left out and
 * counted, so the model can tell the user.
 * @param extent The extent of the map, in its projection, if the config has one
 */
export function sanitizeDrawn(
  raw: unknown,
  extent: number[] | null
): { features: DrawnFeature[]; skipped: number } {
  const entries = Array.isArray(raw) ? raw : [];
  const inside = insideCheck(extent);
  const features: DrawnFeature[] = [];
  const ids = new Set<string>();
  let vertices = 0;
  let skipped = 0;

  for (const entry of entries as Array<Record<string, unknown> | null>) {
    const id = entry?.id;
    const geometry = readGeometry(entry?.geometry, inside);
    const count = geometry === null ? 0 : vertexCount(geometry);
    if (
      typeof id !== "string" ||
      !DRAWN_ID.test(id) ||
      ids.has(id) ||
      geometry === null ||
      features.length >= MAX_DRAWN ||
      vertices + count > MAX_DRAWN_VERTICES
    ) {
      skipped += 1;
      continue;
    }
    ids.add(id);
    vertices += count;
    features.push({ id, title: cleanTitle(entry?.title), geometry });
  }
  return { features, skipped };
}

// ---- What the model is told about them ----

const ringArea = (ring: Position[]): number =>
  Math.abs(
    ring.reduce((sum, [x1, y1], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return sum + x1 * y2 - x2 * y1;
    }, 0) / 2
  );

const polygonArea = ([outer, ...holes]: Position[][]): number =>
  ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);

const lineLength = (line: Position[]): number =>
  line.reduce(
    (sum, [x, y], i) =>
      i === 0 ? 0 : sum + Math.hypot(x - line[i - 1][0], y - line[i - 1][1]),
    0
  );

/**
 * @summary A drawn feature as the model sees it: its kind and size, and never
 * its coordinates. Sizes are in metres of the map projection, the same
 * assumption as `near` makes.
 */
export function describeDrawn({ id, title, geometry }: DrawnFeature) {
  const base = { id, ...(title !== null && { title }) };
  switch (geometry.type) {
    case "Point":
      return { ...base, kind: "point" };
    case "MultiPoint":
      return { ...base, kind: "points", count: geometry.coordinates.length };
    case "LineString":
      return {
        ...base,
        kind: "line",
        lengthM: Math.round(lineLength(geometry.coordinates)),
      };
    case "MultiLineString":
      return {
        ...base,
        kind: "line",
        lengthM: Math.round(
          geometry.coordinates.reduce((sum, l) => sum + lineLength(l), 0)
        ),
      };
    case "Polygon":
      return {
        ...base,
        kind: "area",
        areaM2: Math.round(polygonArea(geometry.coordinates)),
      };
    case "MultiPolygon":
      return {
        ...base,
        kind: "area",
        areaM2: Math.round(
          geometry.coordinates.reduce((sum, p) => sum + polygonArea(p), 0)
        ),
      };
  }
}
