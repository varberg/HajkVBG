// What the tools send to the browser. The client's plugins/AiChat/types.ts
// mirrors these, so change both together.
import type { Feature } from "../features/geojson.ts";

export type LayerControl = "toggle" | "background" | "place" | "none";

export interface PresentedLayer {
  /** Null for search-only layers, which have nothing to control on the map. */
  id: string | null;
  caption: string;
  groupPath: string[];
  control: LayerControl;
  /** Places only: the name to go to, see CatalogRecord.presetName. */
  place?: string;
}

export type PluginAction = "open_plugin" | "close_plugin";

/**
 * What the Search panel needs to show a source. It's sent along, as a source for
 * the chat only isn't among the sources of Search in the client.
 */
export interface ShownSource {
  id: string;
  caption: string;
  displayFields: string[];
  infobox: string | null;
}

/** Features for the Search panel, with all properties so that the infobox works. */
export interface FeatureSet {
  source: ShownSource;
  featureCollection: { type: "FeatureCollection"; features: Feature[] };
}

/** A route, reachable area, line or nearest stops for the map, see mcp/servers/routing/routingTools.ts. */
export interface ShownRoute {
  /** Signed and short-lived, fetched by the browser. Never shown to the model. */
  url: string;
  kind: "route" | "reach" | "line" | "stops";
  /** The whole result, which the model only got part of. */
  summary: Record<string, unknown>;
}

export type ToolEvent =
  | { type: "layers"; items: PresentedLayer[] }
  | {
      type: "action";
      action: "set_layer_visibility";
      ids: string[];
      visible: boolean;
    }
  | { type: "action"; action: "set_background"; id: string }
  | { type: "action"; action: PluginAction; plugin: string }
  | { type: "action"; action: "go_to_place"; place: string }
  | { type: "action"; action: "show_features"; collections: FeatureSet[] }
  | { type: "action"; action: "clear_features" }
  | { type: "action"; action: "show_route"; routes: ShownRoute[] }
  | {
      /** The result of an MCP server with `client` exposure, see exposure.ts. */
      type: "mcp_result";
      server: string;
      tool: string;
      resultId: string;
      result: Record<string, unknown>;
    };
