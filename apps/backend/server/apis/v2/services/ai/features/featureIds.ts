import { createHash } from "node:crypto";

import { isAddressable } from "./featureResults.ts";
import type { Feature } from "./geojson.ts";

/** The id of a feature that has no stable one, see `idOf`. */
export const DERIVED_ID = /^(r\d+)~([0-9a-f]{16})$/;

/** @summary Properties are the same in every response, unlike a `fid-` id. */
export const propertyHash = ({ properties }: Feature): string =>
  createHash("sha256")
    .update(JSON.stringify(properties ?? {}))
    .digest("hex")
    .slice(0, 16);

/**
 * @summary The id the model sees. A source without a primary key, such as a
 * view, gives ids that change with every request, so such a feature gets one
 * from the result that found it and its properties. Features that only differ
 * in their geometry then share an id.
 */
export function idOf(feature: Feature, resultId: string): string {
  const { id } = feature;
  return id !== undefined && isAddressable(String(id))
    ? String(id)
    : `${resultId}~${propertyHash(feature)}`;
}
