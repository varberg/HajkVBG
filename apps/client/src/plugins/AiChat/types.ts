import type Feature from "ol/Feature";
import type OlMap from "ol/Map";

import type LayerControlModel from "../../models/LayerControlModel";
import type SearchModel from "../../models/SearchModel";
import type ToolControlModel from "../../models/ToolControlModel";
import type { HajkApp } from "../../types/hajk";
import type AiChatModel from "./AiChatModel";
import type { RouteLayer } from "./routeLayer";

// ---- Plugin options (from the map config) ----

export interface AiChatOptions {
  visibleAtStart?: boolean;
  title?: string;
  description?: string;
  /** Text shown before the first question */
  introText?: string;
  /** Web page that the intro's warning links to as the municipality's privacy policy */
  privacyPolicyUrl?: string;
  /** Whether users may share what they draw with Sketch. On unless false. */
  drawnFeatures?: boolean;
  /** Read by Backend: whether answers end with follow-up questions. Off unless true. */
  suggestions?: boolean;
  target?: string;
  position?: string;
  width?: number;
  height?: number | string;
}

export type AiChatApp = HajkApp & {
  layerControl: LayerControlModel;
  toolControl: ToolControlModel;
  /** Set if Search is in the map config, even if it isn't rendered */
  searchModel?: SearchModel;
  plugins: {
    search?: {
      options: { renderElsewhere?: boolean; [key: string]: unknown };
    };
  };
};

// ---- Component props ----

export interface AiChatProps {
  app: AiChatApp;
  map: OlMap;
  options: AiChatOptions;
  [key: string]: unknown;
}

export interface AiChatViewProps {
  model: AiChatModel;
  layerControl: LayerControlModel;
  introText: string;
  privacyPolicyUrl?: string;
}

export interface DrawnToggleProps {
  model: AiChatModel;
  checked: boolean;
  count: number;
}

export interface ChatMessageItemProps {
  message: ChatMessage;
  routeLayer: RouteLayer;
  layerControl: LayerControlModel;
  onGoToPlace: (name: string) => void;
  onDownload: (answerId: number, format: DownloadFormat) => void;
}

export interface DownloadMenuProps {
  /** False if all that was drawn are areas, which GPX can't hold */
  gpx: boolean;
  onDownload: (format: DownloadFormat) => void;
}

export interface RouteCardProps {
  summary: RouteSummary;
  /** The color of the route on the map */
  color: string;
  routeLayer: RouteLayer;
  shownId: number | null;
  /** Its place among the routes of the answer */
  index: number;
}

export interface LayerResultListProps {
  items: PresentedLayer[];
  layerControl: LayerControlModel;
  onGoToPlace: (name: string) => void;
}

// ---- What Backend sends, see services/ai/orchestrator.ts and tools.ts ----

export interface PresentedLayer {
  /** Null for search-only layers, which have nothing to control on the map */
  id: string | null;
  caption: string;
  groupPath: string[];
  control: "toggle" | "background" | "place" | "none";
  /** Places only: the name as in the map config, which the caption may not be */
  place?: string;
}

export type LayerAction =
  | { action: "set_layer_visibility"; ids: string[]; visible: boolean }
  | { action: "set_background"; id: string };

export type PluginAction =
  | { action: "open_plugin"; plugin: string }
  | { action: "close_plugin"; plugin: string };

export type PlaceAction = { action: "go_to_place"; place: string };

/** GeoJSON in the map's projection, with all the properties of the features */
export interface FeatureSet {
  source: SearchSource;
  featureCollection: object;
}

export type FeatureAction =
  | { action: "show_features"; collections: FeatureSet[] }
  | { action: "clear_features" };

export interface RouteStreet {
  name: string;
  km: number;
  minutes: number;
}

export interface RouteLeg {
  leg: number;
  from: string;
  to: string;
  minutes: number | null;
  km: number | null;
  /** The lines taken, by transit */
  lines?: string[];
}

/** One step of a transit route: a walk, a wait at a stop or a ride */
export interface TransitStep {
  walk_min?: number;
  km?: number;
  /** The streets of a walk */
  via?: string[];
  wait_min?: number;
  /** Where the wait is */
  at?: string;
  ride_min?: number;
  line?: string;
  towards?: string;
  from?: string;
  to?: string;
  trips_per_hour?: number;
}

export interface LineStop {
  stop: string;
  /** From the first stop */
  minutes: number;
}

/** One direction of a public transport line */
export interface LineVariant {
  direction_id: number;
  from: string;
  to: string;
  towards?: string;
  trips_per_hour?: number;
  run_minutes?: number;
  km?: number;
  stops: LineStop[];
}

/** A stop near a place, by walking */
export interface NearStop {
  stop: string;
  walk_min: number;
  walk_m: number;
  lines?: string[];
  departures_per_hour?: number;
}

/** The nearest stops of one place, from nearest_stops */
export interface PlaceStops {
  point: string;
  snap_m?: number;
  stops: NearStop[];
}

/**
 * The whole result of a routing tool, which the model only sees a part of. The
 * fields depend on `tool` and `mode`, see the routing MCP server.
 */
export interface RouteSummary {
  tool: string;
  mode?: string;
  from?: string;
  to?: string;
  minutes?: number | null;
  km?: number | null;
  streets?: RouteStreet[];
  streets_truncated?: number;
  legs?: RouteLeg[];
  total_minutes?: number;
  total_km?: number;
  road_km?: number;
  /** Transit */
  walk_min?: number;
  wait_min?: number;
  ride_min?: number;
  changes?: number;
  steps?: TransitStep[];
  /** line_info */
  line?: string;
  name?: string | null;
  variants?: LineVariant[];
  /** nearest_stops */
  results?: PlaceStops[];
  /** With `avoid` */
  avoided?: AvoidedArea[];
  minutes_without_avoid?: number | null;
  km_without_avoid?: number | null;
  [key: string]: unknown;
}

/** An area that a route avoided, see `avoid` in the routing MCP server */
export interface AvoidedArea {
  area: string;
  road_links_closed?: number;
  roads?: string[];
  /** False if it was left out, such as an area closed for cars on a bike route */
  applied?: boolean;
}

/** `url` is a signed link to GeoJSON in the map's projection, on the MCP server */
export interface ShownRoute {
  url: string;
  kind: "route" | "reach" | "line" | "stops";
  summary: RouteSummary;
}

export type RouteAction = { action: "show_route"; routes: ShownRoute[] };

export type ChatAction =
  LayerAction | PluginAction | PlaceAction | FeatureAction | RouteAction;

export type ChatEvent =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool_status"; tool: string; status: "running" | "done" | "failed" }
  | { type: "layers"; items: PresentedLayer[] }
  | { type: "suggestions"; items: string[] }
  | ({ type: "action" } & ChatAction)
  // From an MCP server with `client` exposure. Backend turns those servers off
  // for now, see readMcpExtensions, so nothing shows it yet.
  | {
      type: "mcp_result";
      server: string;
      tool: string;
      resultId: string;
      result: Record<string, unknown>;
    }
  | { type: "done"; truncated: boolean }
  | { type: "error"; code: string; message: string };

// ---- From the map config, see controls/PresetLinks.jsx ----

export interface Preset {
  name: string;
  presetUrl: string;
}

// ---- What Search shows, see components/Search/Search.jsx ----

export interface SearchSource {
  id: string;
  [key: string]: unknown;
}

export interface SearchResult {
  source: SearchSource;
  origin: "WFS";
  value: { features: Feature[] };
}

// ---- The state of the chat ----

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** A question only: how many drawings were shared with it */
  drawnShared: number;
  /** A question only: whether personal numbers were masked in it */
  personalNumberMasked: boolean;
  layers: PresentedLayer[];
  /** Follow-up questions, shown under the latest answer only */
  suggestions: string[];
  /** The routes this answer showed on the map, in the order of their colors */
  routes: RouteSummary[];
  /** Which showing on the map they are, see RouteLayer */
  routesShownId: number | null;
  /** Set if the answer drew something on the map, that can be downloaded */
  download: { gpx: boolean } | null;
  notices: string[];
  error: string | null;
  stopped: boolean;
}

export type DownloadFormat = "kml" | "gpx" | "geojson";

/** The answer's own copy of what it drew, kept after newer answers replace it */
export interface DrawnItems {
  /** GeoJSON in the map projection, one per route, as for RouteLayer.show */
  routes: Array<object | null>;
  /** The showing on the map, so that routes unchecked there are left out */
  routesShownId: number | null;
  routeNames: string[];
  /** The ones given to Search. Search sets their `featureTitle`. */
  features: Feature[];
}

export interface ChatState {
  messages: ChatMessage[];
  running: boolean;
  /** The tool that the model is using right now */
  activeTool: string | null;
  /** Whether the next question takes what the user has drawn */
  includeDrawn: boolean;
}

/** A drawing as sent to Backend, see services/ai/features/drawn.ts */
export interface SharedDrawing {
  id: string;
  title: string | null;
  /** GeoJSON in the map projection */
  geometry: object;
}

/**
 * What `LayerControlModel.getLayerStateSnapshot()` returns. `state` is only set
 * for a tree group folder, and `visibleSubLayers` for everything else.
 */
export interface LayerSnapshot {
  visible: boolean;
  visibleSubLayers?: string[];
  state?: "all" | "some" | "none";
}
