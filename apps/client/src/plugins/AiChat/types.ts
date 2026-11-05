import type OlMap from "ol/Map";

import type LayerControlModel from "../../models/LayerControlModel";
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

export type AiChatApp = HajkApp & { layerControl: LayerControlModel };

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
}

export interface LayerResultListProps {
  items: PresentedLayer[];
  layerControl: LayerControlModel;
}

// ---- What Backend sends, see services/ai/orchestrator.ts and tools.ts ----

export interface PresentedLayer {
  /** Null for search-only layers, which have nothing to control on the map */
  id: string | null;
  caption: string;
  groupPath: string[];
  control: "toggle" | "background" | "none";
}

export type LayerAction =
  | { action: "set_layer_visibility"; ids: string[]; visible: boolean }
  | { action: "set_background"; id: string };

export type ChatEvent =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool_status"; tool: string; status: "running" | "done" | "failed" }
  | { type: "layers"; items: PresentedLayer[] }
  | ({ type: "action" } & LayerAction)
  | { type: "done"; truncated: boolean }
  | { type: "error"; code: string; message: string };

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
