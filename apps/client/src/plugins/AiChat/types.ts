import type Feature from "ol/Feature";
import type OlMap from "ol/Map";

import type LayerControlModel from "../../models/LayerControlModel";
import type SearchModel from "../../models/SearchModel";
import type ToolControlModel from "../../models/ToolControlModel";
import type { HajkApp } from "../../types/hajk";
import type AiChatModel from "./AiChatModel";

// ---- Plugin options (from the map config) ----

export interface AiChatOptions {
  visibleAtStart?: boolean;
  title?: string;
  description?: string;
  /** Text shown before the first question */
  introText?: string;
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
  plugins: { search?: { options: { renderElsewhere?: boolean } } };
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
}

export interface ChatMessageItemProps {
  message: ChatMessage;
  layerControl: LayerControlModel;
  onGoToPlace: (name: string) => void;
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
  sourceId: string;
  featureCollection: object;
}

export type FeatureAction =
  | { action: "show_features"; collections: FeatureSet[] }
  | { action: "clear_features" };

export type ChatAction =
  LayerAction | PluginAction | PlaceAction | FeatureAction;

export type ChatEvent =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool_status"; tool: string; status: "running" | "done" | "failed" }
  | { type: "layers"; items: PresentedLayer[] }
  | ({ type: "action" } & ChatAction)
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
  layers: PresentedLayer[];
  notices: string[];
  error: string | null;
  stopped: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  running: boolean;
  /** The tool that the model is using right now */
  activeTool: string | null;
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
