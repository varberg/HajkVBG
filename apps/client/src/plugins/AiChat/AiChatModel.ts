import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";

import type LayerControlModel from "../../models/LayerControlModel";
import type SearchModel from "../../models/SearchModel";
import type ToolControlModel from "../../models/ToolControlModel";
import { hfetch } from "../../utils/FetchWrapper";

import { ERRORS, REQUEST_ERRORS, TURN_ERRORS, UI_STRINGS } from "./constants";
import { readEvents } from "./sse";
import type {
  AiChatApp,
  ChatAction,
  ChatEvent,
  ChatMessage,
  ChatState,
  FeatureSet,
  LayerSnapshot,
  Preset,
  PresentedLayer,
  SearchSource,
} from "./types";

const EMPTY_STATE: ChatState = {
  messages: [],
  running: false,
  activeTool: null,
};

/** Unique within a list of layers. Search-only layers have no id. */
export const layerKey = ({ id, caption, groupPath }: PresentedLayer): string =>
  id ?? [...groupPath, caption].join("/");

/** The code of an error response. It can only be read once. */
async function readErrorCode(response: Response): Promise<string | null> {
  if (response.ok) {
    return null;
  }
  const body = await response.json().catch(() => null);
  return body?.details?.code ?? "";
}

function requestErrorText(status: number, code: string | null): string {
  if (code && REQUEST_ERRORS[code]) {
    return REQUEST_ERRORS[code];
  }
  // These two don't come from the chat itself, so they have no code
  if (status === 403) {
    return ERRORS.forbidden;
  }
  return status === 429 ? ERRORS.tooMany : ERRORS.generic;
}

/**
 * @summary Talks to the chat endpoint in Backend, and holds the conversation.
 * @description The state lives here and not in the view, so that a conversation
 * survives closing the window, and a running answer can finish meanwhile.
 */
export default class AiChatModel {
  #app: AiChatApp;
  #url: string;
  #map: string;
  #layerControl: LayerControlModel;
  #toolControl: ToolControlModel;
  #globalObserver: AiChatApp["globalObserver"];
  #presets: Preset[];
  #state: ChatState = EMPTY_STATE;
  #listeners = new Set<() => void>();
  #conversationId: string | null = null;
  #abort: AbortController | null = null;
  #nextMessageId = 1;

  constructor(app: AiChatApp) {
    this.#app = app;
    const appConfig = app.config.appConfig as { mapserviceBase: string };
    this.#url = `${appConfig.mapserviceBase}/ai/chat`;
    this.#map = app.config.activeMap as string;
    this.#layerControl = app.layerControl;
    this.#toolControl = app.toolControl;
    this.#globalObserver = app.globalObserver;

    const { tools } = app.config.mapConfig as {
      tools: Array<{ type: string; options?: { presetList?: Preset[] } }>;
    };
    this.#presets =
      tools.find((tool) => tool.type === "preset")?.options?.presetList ?? [];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = (): ChatState => this.#state;

  /** Stop the running answer. Backend discards the turn. */
  stop = (): void => this.#abort?.abort();

  /** Leave the conversation and start over */
  reset = (): void => {
    this.stop();
    this.#abort = null;
    this.#conversationId = null;
    this.#setState(EMPTY_STATE);
  };

  /**
   * @summary Go to a place, the same way as picking it in the Preset control.
   * @returns False if the place isn't in the map config that was loaded, which
   * can happen if the config has changed since then
   */
  goToPlace = (name: string): boolean => {
    const preset = this.#presets.find((p) => p.name === name);
    if (preset === undefined) {
      return false;
    }
    this.#globalObserver.publish("preset.selectPreset", preset);
    return true;
  };

  send = async (text: string): Promise<void> => {
    const message = text.trim();
    if (message === "" || this.#state.running) {
      return;
    }

    const abort = new AbortController();
    this.#abort = abort;
    const question = this.#createMessage("user", message);
    const answer = this.#createMessage("assistant", "");
    this.#setState({
      running: true,
      activeTool: null,
      messages: [...this.#state.messages, question, answer],
    });

    try {
      await this.#runTurn(message, answer.id, abort.signal);
    } catch {
      this.#updateMessage(answer.id, () =>
        abort.signal.aborted ? { stopped: true } : { error: ERRORS.connection }
      );
    }

    // After a reset the state belongs to the next conversation
    if (this.#abort === abort) {
      this.#abort = null;
      this.#setState({ running: false, activeTool: null });
    }
  };

  #createMessage(role: ChatMessage["role"], text: string): ChatMessage {
    return {
      id: this.#nextMessageId++,
      role,
      text,
      layers: [],
      notices: [],
      error: null,
      stopped: false,
    };
  }

  #setState(state: Partial<ChatState>): void {
    this.#state = { ...this.#state, ...state };
    this.#listeners.forEach((listener) => listener());
  }

  #updateMessage(
    id: number,
    update: (message: ChatMessage) => Partial<ChatMessage>
  ): void {
    this.#setState({
      messages: this.#state.messages.map((message) =>
        message.id === id ? { ...message, ...update(message) } : message
      ),
    });
  }

  #getMapState() {
    const layerControl = this.#layerControl;
    return {
      layers: layerControl.getVisibleLayerIds().map((id) => {
        const state = layerControl.getLayerStateSnapshot(id) as LayerSnapshot;
        return { id, visibleSubLayers: state.visibleSubLayers ?? [] };
      }),
      background: layerControl.getActiveBackgroundId(),
    };
  }

  #post(message: string, signal: AbortSignal): Promise<Response> {
    return hfetch(this.#url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        map: this.#map,
        conversationId: this.#conversationId,
        message,
        mapState: this.#getMapState(),
      }),
    });
  }

  async #runTurn(
    message: string,
    answerId: number,
    signal: AbortSignal
  ): Promise<void> {
    let response = await this.#post(message, signal);
    let code = await readErrorCode(response);

    // Happens after a restart, a long pause or a very long conversation. The
    // question wasn't answered, so it's safe to ask it again in a new one.
    if (code === "conversation_lost") {
      this.#conversationId = null;
      this.#addNotice(answerId, UI_STRINGS.conversationRestarted);
      response = await this.#post(message, signal);
      code = await readErrorCode(response);
    }

    if (!response.ok) {
      const error = requestErrorText(response.status, code);
      this.#updateMessage(answerId, () => ({ error }));
      return;
    }
    await this.#readAnswer(response, answerId, signal);
  }

  async #readAnswer(
    response: Response,
    answerId: number,
    signal: AbortSignal
  ): Promise<void> {
    let finished = false;

    for await (const { event, data } of readEvents(response.body!)) {
      // A chunk can hold several events, and none may run after a stop
      signal.throwIfAborted();
      const chatEvent = { ...JSON.parse(data), type: event } as ChatEvent;
      finished = chatEvent.type === "done" || chatEvent.type === "error";
      this.#handleEvent(chatEvent, answerId);
    }

    // The connection can be lost without any error along the way
    if (!finished) {
      throw new Error("The stream ended before the answer was complete");
    }
  }

  #handleEvent(event: ChatEvent, answerId: number): void {
    switch (event.type) {
      case "start":
        this.#conversationId = event.conversationId;
        break;
      case "text":
        this.#setState({ activeTool: null });
        this.#updateMessage(answerId, ({ text }) => ({
          text: text + event.delta,
        }));
        break;
      case "tool_status":
        this.#setState({
          activeTool: event.status === "running" ? event.tool : null,
        });
        break;
      case "layers":
        this.#addLayers(answerId, event.items);
        break;
      case "action":
        this.#runAction(event, answerId);
        break;
      case "done":
        if (event.truncated) {
          this.#addNotice(answerId, UI_STRINGS.truncated);
        }
        break;
      case "error": {
        const error = TURN_ERRORS[event.code] ?? ERRORS.generic;
        this.#updateMessage(answerId, () => ({ error }));
        break;
      }
    }
  }

  #addNotice(answerId: number, notice: string): void {
    this.#updateMessage(answerId, ({ notices }) => ({
      notices: notices.includes(notice) ? notices : [...notices, notice],
    }));
  }

  #addLayers(answerId: number, items: PresentedLayer[]): void {
    this.#updateMessage(answerId, ({ layers }) => {
      const shown = new Set(layers.map(layerKey));
      return {
        layers: [
          ...layers,
          ...items.filter((item) => !shown.has(layerKey(item))),
        ],
      };
    });
  }

  /** The search model exists even if Search isn't there, see App.jsx */
  #getSearchModel(): SearchModel | null {
    const search = this.#app.plugins.search;
    return search && search.options.renderElsewhere !== true
      ? (this.#app.searchModel ?? null)
      : null;
  }

  #showFeatures(sets: FeatureSet[], answerId: number): void {
    const searchModel = this.#getSearchModel();
    if (searchModel === null) {
      this.#addNotice(answerId, UI_STRINGS.searchUnavailable);
      return;
    }

    const sources: SearchSource[] = searchModel.getSources();
    const format = new GeoJSON();
    const results = sets.flatMap(({ sourceId, featureCollection }) => {
      const source = sources.find(({ id }) => id === sourceId);
      if (source === undefined) {
        return [];
      }
      const features = format.readFeatures(featureCollection) as Feature[];
      return [{ source, origin: "WFS" as const, value: { features } }];
    });

    if (results.length < sets.length) {
      this.#addNotice(answerId, UI_STRINGS.featuresUnavailable);
    }
    if (results.length > 0) {
      this.#globalObserver.publish("search.showFeatureCollections", results);
    }
  }

  /** Backend has already checked that the user may do this */
  #runAction(action: ChatAction, answerId: number): void {
    if (action.action === "open_plugin") {
      // A tool in the map config isn't loaded unless it's in `availableTools` too
      if (!this.#toolControl.showTool(action.plugin)) {
        this.#addNotice(answerId, UI_STRINGS.pluginUnavailable);
      }
      return;
    }
    if (action.action === "close_plugin") {
      this.#toolControl.hideTool(action.plugin);
      return;
    }
    if (action.action === "go_to_place") {
      if (!this.goToPlace(action.place)) {
        this.#addNotice(answerId, UI_STRINGS.placeUnavailable);
      }
      return;
    }
    if (action.action === "set_background") {
      this.#layerControl.showLayer(action.id);
      return;
    }
    if (action.action === "show_features") {
      this.#showFeatures(action.collections, answerId);
      return;
    }
    if (action.action === "clear_features") {
      if (this.#getSearchModel() === null) {
        this.#addNotice(answerId, UI_STRINGS.searchUnavailable);
      } else {
        this.#globalObserver.publish("search.clearResults");
      }
      return;
    }
    action.ids.forEach((id) =>
      this.#layerControl.setLayerVisibility(id, action.visible)
    );
  }
}
