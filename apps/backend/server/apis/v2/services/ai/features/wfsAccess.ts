import catalogService from "../catalog.service.ts";
import type { FeatureConnection } from "../catalog.service.ts";
import { WfsClient } from "./wfsClient.ts";

/**
 * What the tools use to reach the sources. Connections hold URLs, so they stay
 * in the catalog and are looked up here, instead of being on UserCatalog.
 */
export interface WfsAccess {
  connectionOf(
    map: string,
    sourceId: string
  ): Promise<FeatureConnection | undefined>;
  query: WfsClient["query"];
}

export function createWfsAccess(timeoutMs: number): WfsAccess {
  const client = new WfsClient({ timeoutMs });
  return {
    async connectionOf(map, sourceId) {
      const { featureConnections } = await catalogService.getCatalog(map);
      return featureConnections.get(sourceId);
    },
    query: (target, options, signal) => client.query(target, options, signal),
  };
}
