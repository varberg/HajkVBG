import type { JsonSchema, ToolContext } from "../../../tools.ts";
import { AVOID_SCHEMA, resolveAvoid } from "./avoid.ts";
import { LOCATION_SCHEMA, resolveLocation } from "./location.ts";
import type { Location } from "./location.ts";

/**
 * @summary Turn the model's input into the server's: every location becomes a
 * point and every list of areas to avoid becomes GeoJSON. They are found by
 * their schema, which is the same object wherever it's used, see
 * toRegistrySchema.
 */
export async function prepareArgs(
  value: unknown,
  schema: JsonSchema,
  context: ToolContext
): Promise<unknown> {
  if (value === null || value === undefined) {
    return value;
  }
  if (schema === LOCATION_SCHEMA) {
    return resolveLocation(value as Location, context);
  }
  if (Array.isArray(value) && schema.items === AVOID_SCHEMA) {
    return resolveAvoid(value, context);
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    const items = schema.items;
    return Promise.all(value.map((item) => prepareArgs(item, items, context)));
  }
  if (typeof value === "object" && schema.properties !== undefined) {
    const properties = schema.properties;
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([key, v]) => [
        key,
        properties[key] === undefined
          ? v
          : await prepareArgs(v, properties[key], context),
      ])
    );
    return Object.fromEntries(entries);
  }
  return value;
}
