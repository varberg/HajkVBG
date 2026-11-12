import type { FeatureSource } from "../access.service.ts";
import { isDisplayLabel } from "../catalog.service.ts";
import type { FeatureConnection } from "../catalog.service.ts";
import { featureLinks } from "./featureLinks.ts";
import type { Match } from "./featureFetch.ts";
import { idOf } from "./featureIds.ts";

const MAX_VALUE_LENGTH = 300;

/** @returns The value as the model may see it, or undefined if it's empty */
export function readable(
  value: unknown
): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  const text = value === null || value === undefined ? "" : String(value);
  return text.trim().slice(0, MAX_VALUE_LENGTH) || undefined;
}

/** @summary The title Search shows, which can be empty for a feature without. */
export function titleOf(
  { displayFields }: FeatureConnection,
  properties: Record<string, unknown>
): string {
  return displayFields
    .map((field) =>
      isDisplayLabel(field)
        ? field.replaceAll('"', "")
        : readable(properties[field])
    )
    .filter((value) => value !== undefined)
    .join(" | ");
}

/**
 * @summary A feature as the model sees it: allowed fields, the links of its
 * infobox, and no geometry.
 */
export function toRow(
  { feature, distance }: Match,
  resultId: string,
  source: FeatureSource,
  connection: FeatureConnection
) {
  const properties = feature.properties ?? {};
  const fields = Object.fromEntries(
    source.fields.flatMap((field) => {
      const value = readable(properties[field]);
      return value === undefined ? [] : [[field, value]];
    })
  );
  const links = featureLinks(connection.infobox, properties, source.fields);
  return {
    id: idOf(feature, resultId),
    title: titleOf(connection, properties),
    geometryType: feature.geometry?.type ?? null,
    fields,
    ...(links.length > 0 && { links }),
    ...(distance !== null &&
      Number.isFinite(distance) && { distanceM: Math.round(distance) }),
  };
}
