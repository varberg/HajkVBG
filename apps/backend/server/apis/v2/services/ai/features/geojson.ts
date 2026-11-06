/** The parts of GeoJSON that the WFS sources return. */
export type Position = number[];

export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export interface Feature {
  type: "Feature";
  id?: string;
  geometry: Geometry | null;
  properties: Record<string, unknown> | null;
}
