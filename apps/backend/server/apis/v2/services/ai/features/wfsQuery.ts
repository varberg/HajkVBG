import type { Geometry, Position } from "./geojson.ts";

export type FilterOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "like";

export interface FieldFilter {
  field: string;
  op: FilterOp;
  value: string;
}

export interface FeatureSort {
  field: string;
  descending: boolean;
}

export interface FeatureFilter {
  /** Matched as one phrase, as splitting "Kungsgatan 12" would also find 112. */
  text: string | null;
  filters: FieldFilter[];
  /** Leaves out features that have no value in this field. */
  hasValue: string | null;
  /** In map units, where 0 means intersecting. */
  near: { geometry: Geometry; distance: number } | null;
}

/** What a query needs to know about its source. */
export interface QueryTarget {
  typeName: string;
  geometryField: string;
  /** Always the map's projection, see geometryToGml. */
  srsName: string;
  searchFields: string[];
}

export interface GetFeatureOptions {
  /** From buildFilter or buildResourceIdFilter. Empty means no filter. */
  filter: string;
  sort: FeatureSort | null;
  /** 0 gives the number of matches and no features, see WfsClient. */
  count: number;
}

// Same characters as SearchModel.js in the client
const WILDCARD = "*";
const SINGLE_CHAR = "~";
const ESCAPE_CHAR = "!";

const COMPARISONS: Record<Exclude<FilterOp, "like">, string> = {
  eq: "PropertyIsEqualTo",
  ne: "PropertyIsNotEqualTo",
  lt: "PropertyIsLessThan",
  lte: "PropertyIsLessThanOrEqualTo",
  gt: "PropertyIsGreaterThan",
  gte: "PropertyIsGreaterThanOrEqualTo",
};

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => XML_ENTITIES[char]);

/**
 * @summary Make a text literal in a PropertyIsLike. Only these three characters
 * are special there, so that common ones such as "." can be sent as they are
 * (#1844). GeoServer reads a backslash as an escape of its own, so it's doubled.
 */
export const escapeLike = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/[!*~]/g, `${ESCAPE_CHAR}$&`);

const valueReference = (field: string): string =>
  `<fes:ValueReference>${escapeXml(field)}</fes:ValueReference>`;

const literal = (value: string): string =>
  `<fes:Literal>${escapeXml(value)}</fes:Literal>`;

const contains = (field: string, value: string): string =>
  `<fes:PropertyIsLike wildCard="${WILDCARD}" singleChar="${SINGLE_CHAR}" escapeChar="${ESCAPE_CHAR}" matchCase="false">${valueReference(field)}${literal(`${WILDCARD}${escapeLike(value)}${WILDCARD}`)}</fes:PropertyIsLike>`;

const compare = ({ field, op, value }: FieldFilter): string => {
  if (op === "like") {
    return contains(field, value);
  }
  const element = `fes:${COMPARISONS[op]}`;
  return `<${element} matchCase="false">${valueReference(field)}${literal(value)}</${element}>`;
};

// `And` and `Or` need at least two operands
const combine = (operator: "And" | "Or", parts: string[]): string =>
  parts.length > 1
    ? `<fes:${operator}>${parts.join("")}</fes:${operator}>`
    : parts.join("");

const coordinates = (positions: Position[]): string =>
  escapeXml(positions.map(([x, y]) => `${x} ${y}`).join(" "));

const point = (position: Position, attributes = ""): string =>
  `<gml:Point${attributes}><gml:pos>${coordinates([position])}</gml:pos></gml:Point>`;

const line = (positions: Position[], attributes = ""): string =>
  `<gml:LineString${attributes}><gml:posList>${coordinates(positions)}</gml:posList></gml:LineString>`;

const ring = (positions: Position[]): string =>
  `<gml:LinearRing><gml:posList>${coordinates(positions)}</gml:posList></gml:LinearRing>`;

const polygon = ([exterior, ...holes]: Position[][], attributes = ""): string =>
  `<gml:Polygon${attributes}><gml:exterior>${ring(exterior)}</gml:exterior>${holes
    .map((hole) => `<gml:interior>${ring(hole)}</gml:interior>`)
    .join("")}</gml:Polygon>`;

/**
 * @summary A GeoJSON geometry as GML 3.2, in x,y order.
 * @param srsName The map's projection. It must not be taken from the `crs` of a
 * response: a filter with the `urn:ogc:def:crs:EPSG::3007` form found there
 * gives no error, and matches nothing.
 * @throws If the geometry isn't one of the types that sources return
 */
export function geometryToGml(geometry: Geometry, srsName: string): string {
  const srs = ` srsName="${escapeXml(srsName)}"`;
  const members = (name: string, parts: string[]) =>
    parts.map((part) => `<gml:${name}>${part}</gml:${name}>`).join("");

  switch (geometry.type) {
    case "Point":
      return point(geometry.coordinates, srs);
    case "LineString":
      return line(geometry.coordinates, srs);
    case "Polygon":
      return polygon(geometry.coordinates, srs);
    case "MultiPoint":
      return `<gml:MultiPoint${srs}>${members(
        "pointMember",
        geometry.coordinates.map((position) => point(position))
      )}</gml:MultiPoint>`;
    case "MultiLineString":
      return `<gml:MultiCurve${srs}>${members(
        "curveMember",
        geometry.coordinates.map((positions) => line(positions))
      )}</gml:MultiCurve>`;
    case "MultiPolygon":
      return `<gml:MultiSurface${srs}>${members(
        "surfaceMember",
        geometry.coordinates.map((rings) => polygon(rings))
      )}</gml:MultiSurface>`;
    default:
      throw new Error(
        `Unsupported geometry type "${(geometry as { type: string }).type}".`
      );
  }
}

function spatial(
  { geometry, distance }: NonNullable<FeatureFilter["near"]>,
  { geometryField, srsName }: QueryTarget
): string {
  const operands = `${valueReference(geometryField)}${geometryToGml(geometry, srsName)}`;
  return distance === 0
    ? `<fes:Intersects>${operands}</fes:Intersects>`
    : `<fes:DWithin>${operands}<fes:Distance uom="m">${distance}</fes:Distance></fes:DWithin>`;
}

const wrapFilter = (content: string): string =>
  content === "" ? "" : `<fes:Filter>${content}</fes:Filter>`;

/** @returns A complete filter, or an empty string if nothing limits the query */
export function buildFilter(
  { text, filters, hasValue, near }: FeatureFilter,
  target: QueryTarget
): string {
  const phrase = text?.trim();
  const parts = filters.map(compare);

  if (phrase) {
    parts.unshift(
      combine(
        "Or",
        target.searchFields.map((field) => contains(field, phrase))
      )
    );
  }
  if (hasValue !== null) {
    parts.push(
      `<fes:Not><fes:PropertyIsNull>${valueReference(hasValue)}</fes:PropertyIsNull></fes:Not>`
    );
  }
  if (near !== null) {
    parts.push(spatial(near, target));
  }
  return wrapFilter(combine("And", parts));
}

export const buildResourceIdFilter = (id: string): string =>
  wrapFilter(`<fes:ResourceId rid="${escapeXml(id)}"/>`);

const sortBy = ({ field, descending }: FeatureSort): string =>
  `<fes:SortBy><fes:SortProperty>${valueReference(field)}<fes:SortOrder>${
    descending ? "DESC" : "ASC"
  }</fes:SortOrder></fes:SortProperty></fes:SortBy>`;

/**
 * @summary A WFS 2.0 GetFeature request. OGC filters are used and not CQL, as
 * they work the same on any source and leave nothing to quote by hand.
 */
export function buildGetFeature(
  { typeName, srsName }: QueryTarget,
  { filter, sort, count }: GetFeatureOptions
): string {
  return `<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json" count="${count}" xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><wfs:Query typeNames="${escapeXml(typeName)}" srsName="${escapeXml(srsName)}">${filter}${sort === null ? "" : sortBy(sort)}</wfs:Query></wfs:GetFeature>`;
}
