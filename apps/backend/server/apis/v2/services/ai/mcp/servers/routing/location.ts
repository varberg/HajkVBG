import { featurePoint } from "../../../features/featureSearch.ts";
import { MAX_LABEL, ToolError } from "../../../toolSupport.ts";
import type { JsonSchema, ToolContext } from "../../../tools.ts";

/**
 * Takes the place of the server's Point, so that the model can give a feature
 * it has found instead of coordinates, which it never gets. Kept short, as it's
 * repeated for every point argument.
 */
export const LOCATION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    feature_id: {
      type: ["string", "null"],
      description: "The id of a feature from search_features.",
    },
    x: { type: ["number", "null"], description: "Longitude, if no feature." },
    y: { type: ["number", "null"], description: "Latitude, if no feature." },
    label: { type: "string", description: "A short name for the point." },
  },
  required: ["feature_id", "x", "y", "label"],
  additionalProperties: false,
};

export interface Location {
  feature_id: string | null;
  x: number | null;
  y: number | null;
  label: string;
}

/** @returns The EPSG code of a projection such as "EPSG:3007", or null */
export function sridOf(projection: string | null): number | null {
  const match = /^EPSG:(\d+)$/i.exec(projection?.trim() ?? "");
  return match === null ? null : Number(match[1]);
}

/** @summary The point the server wants, for a location the model gave. */
export async function resolveLocation(
  location: Location,
  context: ToolContext
) {
  const label = location.label.trim().slice(0, MAX_LABEL) || null;
  if (location.feature_id !== null) {
    const srid = sridOf(context.userCatalog.mapInfo.projection);
    if (srid === null) {
      throw new ToolError("This map can't route from features.");
    }
    const [x, y] = await featurePoint(location.feature_id, context);
    return { x, y, srid, label };
  }
  if (location.x === null || location.y === null) {
    throw new ToolError("Give a point as feature_id, or as x and y.");
  }
  return { x: location.x, y: location.y, srid: 4326, label };
}
