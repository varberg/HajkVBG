import {
  featureGeometry,
  resultGeometries,
} from "../../../features/featureSearch.ts";
import type { Geometry } from "../../../features/geojson.ts";
import { MAX_LABEL, ToolError } from "../../../toolSupport.ts";
import type { JsonSchema, ToolContext } from "../../../tools.ts";
import { sridOf } from "./location.ts";

/** The server's limit, for all areas of one call together */
export const MAX_AVOID = 50;

/**
 * Takes the place of the server's AvoidArea, whose GeoJSON the model can't
 * write: it never gets coordinates, and the registry's strict schemas can't
 * hold free-form GeoJSON. So the model names features, and Hajk sends their
 * geometry. The mode names are the server's, which checks them too.
 */
export const AVOID_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    feature_id: {
      type: ["string", "null"],
      description:
        "The id of one feature from search_features, or of a drawn feature.",
    },
    result_id: {
      type: ["string", "null"],
      description: `The resultId of a search_features result, to avoid all its features, at most ${MAX_AVOID}.`,
    },
    buffer_m: {
      type: ["number", "null"],
      description:
        "Widen the area by this many metres. Null for the server's default.",
    },
    modes: {
      type: ["array", "null"],
      items: { type: "string", enum: ["car", "bike", "walk", "transit"] },
      description:
        'The modes it is closed for, such as ["car"] for road works that cyclists and pedestrians may pass. Null for all.',
    },
    label: {
      type: "string",
      description: "A short name for the area, such as Vägarbeten.",
    },
  },
  required: ["feature_id", "result_id", "buffer_m", "modes", "label"],
  additionalProperties: false,
};

interface AvoidInput {
  feature_id: string | null;
  result_id: string | null;
  buffer_m: number | null;
  modes: string[] | null;
  label: string;
}

/** What the server takes, see its AvoidArea */
interface AvoidArea {
  geojson: Geometry;
  srid: number;
  buffer_m: number | null;
  modes: string[] | null;
  label: string | null;
}

const tooMany = (count: number) =>
  `That is ${count} areas to avoid, and at most ${MAX_AVOID} can be used. Narrow the search.`;

const clip = (text: string): string | null =>
  text.trim().slice(0, MAX_LABEL) || null;

async function resolveArea(
  input: AvoidInput,
  srid: number,
  context: ToolContext
): Promise<AvoidArea[]> {
  const { feature_id: featureId, result_id: resultId } = input;
  if ((featureId === null) === (resultId === null)) {
    throw new ToolError(
      "Give each area to avoid as either feature_id or result_id."
    );
  }
  const base = { srid, buffer_m: input.buffer_m, modes: input.modes };
  if (featureId !== null) {
    const geojson = await featureGeometry(featureId, context);
    return [{ ...base, geojson, label: clip(input.label) }];
  }
  const features = await resultGeometries(
    resultId as string,
    MAX_AVOID,
    context
  );
  // The server names each area in its result, so give each its own title
  return features.map(({ geometry, title }) => ({
    ...base,
    geojson: geometry,
    label: clip(title === "" ? input.label : `${input.label}: ${title}`),
  }));
}

/**
 * @summary Replace the areas the model named with their geometry, in the map
 * projection. An area that can't be found stops the call, as a route that
 * quietly drives through it would be a wrong answer.
 * @throws {ToolError} If an area is unknown or out of reach, or there are too many
 */
export async function resolveAvoid(
  inputs: AvoidInput[],
  context: ToolContext
): Promise<AvoidArea[]> {
  const srid = sridOf(context.userCatalog.mapInfo.projection);
  if (srid === null) {
    throw new ToolError("This map can't avoid areas.");
  }
  // Before any request, as each feature takes one
  if (inputs.length > MAX_AVOID) {
    throw new ToolError(tooMany(inputs.length));
  }
  const areas = (
    await Promise.all(inputs.map((input) => resolveArea(input, srid, context)))
  ).flat();
  if (areas.length > MAX_AVOID) {
    throw new ToolError(tooMany(areas.length));
  }
  return areas;
}
