import type OlMap from "ol/Map";

import type LayerControlModel from "../../models/LayerControlModel";

import { ChatStore, EMPTY_STATE } from "./chatStore";
import {
  postTurn,
  readChatEvents,
  readErrorCode,
  requestErrorText,
} from "./chatTransport";
import { ERRORS, TURN_ERRORS, UI_STRINGS } from "./constants";
import { DrawnFeatures } from "./drawnFeatures";
import { MapActions } from "./mapActions";
import { maskPersonalNumbers } from "./personalNumbers";
import { RouteLayer } from "./routeLayer";
import type {
  AiChatApp,
  AiChatOptions,
  ChatEvent,
  ChatState,
  DownloadFormat,
  LayerSnapshot,
  PresentedLayer,
  SharedDrawing,
} from "./types";

/** Unique within a list of layers. Search-only layers have no id. */
export const layerKey = ({ id, caption, groupPath }: PresentedLayer): string =>
  id ?? [...groupPath, caption].join("/");

/**
 * @summary Talks to the chat endpoint in Backend, and holds the conversation.
 * @description The state lives here and not in the view, so that a conversation
 * survives closing the window, and a running answer can finish meanwhile.
 */
export default class AiChatModel {
  #url: string;
  #map: string;
  #layerControl: LayerControlModel;
  #store = new ChatStore();
  #actions: MapActions;
  readonly routeLayer: RouteLayer;
  /** What the user has drawn with Sketch, or null if the map doesn't allow it */
  readonly drawings: DrawnFeatures | null;
  #conversationId: string | null = null;
  #abort: AbortController | null = null;

  constructor(app: AiChatApp, map: OlMap, options: AiChatOptions = {}) {
    this.routeLayer = new RouteLayer(map);
    this.#actions = new MapActions({
      app,
      map,
      routeLayer: this.routeLayer,
      store: this.#store,
    });
    this.drawings =
      options.drawnFeatures === false ? null : new DrawnFeatures(map);
    // With nothing drawn there's nothing to take, and the next drawing starts off
    this.drawings?.subscribe(() => {
      if (this.drawings?.getCount() === 0 && this.getState().includeDrawn) {
        this.#store.update({ includeDrawn: false });
      }
    });
    const appConfig = app.config.appConfig as { mapserviceBase: string };
    this.#url = `${appConfig.mapserviceBase}/ai/chat`;
    this.#map = app.config.activeMap as string;
    this.#layerControl = app.layerControl;
  }

  subscribe = (listener: () => void): (() => void) =>
    this.#store.subscribe(listener);

  getState = (): ChatState => this.#store.getState();

  /** Whether the next question takes what the user has drawn */
  setIncludeDrawn = (include: boolean): void => {
    this.#store.update({
      includeDrawn: include && (this.drawings?.getCount() ?? 0) > 0,
    });
  };

  /** Stop the running answer. Backend discards the turn. */
  stop = (): void => this.#abort?.abort();

  /** Leave the conversation and start over, without what it drew on the map */
  reset = (): void => {
    this.stop();
    this.#abort = null;
    this.#conversationId = null;
    this.#actions.reset();
    // About the drawings, not the conversation, so it stays as the user left it
    this.#store.update({
      ...EMPTY_STATE,
      includeDrawn: this.getState().includeDrawn,
    });
  };

  /** See MapActions.download */
  download = (answerId: number, format: DownloadFormat): void =>
    this.#actions.download(answerId, format);

  /** See MapActions.goToPlace */
  goToPlace = (name: string): boolean => this.#actions.goToPlace(name);

  send = async (text: string): Promise<void> => {
    const typed = text.trim();
    const state = this.getState();
    if (typed === "" || state.running) {
      return;
    }
    // Never sent, and the question shows what was
    const message = maskPersonalNumbers(typed);

    const abort = new AbortController();
    this.#abort = abort;
    // Read once, so that a question asked again after a lost conversation
    // takes the same drawings
    const drawn =
      state.includeDrawn && this.drawings ? this.drawings.collect() : [];
    const question = {
      ...this.#store.createMessage("user", message),
      drawnShared: drawn.length,
      personalNumberMasked: message !== typed,
    };
    const answer = this.#store.createMessage("assistant", "");
    this.#store.update({
      running: true,
      activeTool: null,
      messages: [...state.messages, question, answer],
    });

    try {
      await this.#runTurn(message, drawn, answer.id, abort.signal);
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error("AiChat: the answer failed", error);
      }
      this.#store.updateMessage(answer.id, () =>
        abort.signal.aborted ? { stopped: true } : { error: ERRORS.connection }
      );
    }

    // After a reset the state belongs to the next conversation
    if (this.#abort === abort) {
      this.#abort = null;
      this.#store.update({ running: false, activeTool: null });
    }
  };

  #post(
    message: string,
    drawn: SharedDrawing[],
    signal: AbortSignal
  ): Promise<Response> {
    const layerControl = this.#layerControl;
    return postTurn({
      url: this.#url,
      map: this.#map,
      conversationId: this.#conversationId,
      message,
      mapState: {
        layers: layerControl.getVisibleLayerIds().map((id) => {
          const state = layerControl.getLayerStateSnapshot(id) as LayerSnapshot;
          return { id, visibleSubLayers: state.visibleSubLayers ?? [] };
        }),
        background: layerControl.getActiveBackgroundId(),
        drawn,
      },
      signal,
    });
  }

  async #runTurn(
    message: string,
    drawn: SharedDrawing[],
    answerId: number,
    signal: AbortSignal
  ): Promise<void> {
    let response = await this.#post(message, drawn, signal);
    let code = await readErrorCode(response);

    // Happens after a restart, a long pause or a very long conversation. The
    // question wasn't answered, so it's safe to ask it again in a new one.
    if (code === "conversation_lost") {
      this.#conversationId = null;
      this.#store.addNotice(answerId, UI_STRINGS.conversationRestarted);
      response = await this.#post(message, drawn, signal);
      code = await readErrorCode(response);
    }

    if (!response.ok) {
      const error = requestErrorText(response.status, code);
      this.#store.updateMessage(answerId, () => ({ error }));
      return;
    }

    let finished = false;
    for await (const event of readChatEvents(response)) {
      // A chunk can hold several events, and none may run after a stop
      signal.throwIfAborted();
      finished = event.type === "done" || event.type === "error";
      // A throw here would end the stream, and Backend would drop the turn. A
      // plugin that fails to show something shouldn't cost the whole answer.
      try {
        this.#handleEvent(event, answerId, signal);
      } catch (error) {
        console.error(`AiChat: couldn't handle a ${event.type} event`, error);
        this.#store.addNotice(answerId, UI_STRINGS.eventFailed);
      }
    }
    // The connection can be lost without any error along the way
    if (!finished) {
      throw new Error("The stream ended before the answer was complete");
    }
  }

  #handleEvent(event: ChatEvent, answerId: number, signal: AbortSignal): void {
    switch (event.type) {
      case "start":
        this.#conversationId = event.conversationId;
        break;
      case "text":
        this.#store.update({ activeTool: null });
        this.#store.updateMessage(answerId, ({ text }) => ({
          text: text + event.delta,
        }));
        break;
      case "tool_status":
        this.#store.update({
          activeTool: event.status === "running" ? event.tool : null,
        });
        break;
      case "layers":
        this.#store.updateMessage(answerId, ({ layers }) => {
          const shown = new Set(layers.map(layerKey));
          return {
            layers: [
              ...layers,
              ...event.items.filter((item) => !shown.has(layerKey(item))),
            ],
          };
        });
        break;
      case "suggestions":
        this.#store.updateMessage(answerId, () => ({
          suggestions: event.items,
        }));
        break;
      case "action":
        this.#actions.runAction(event, answerId, signal);
        break;
      case "done":
        if (event.truncated) {
          this.#store.addNotice(answerId, UI_STRINGS.truncated);
        }
        break;
      case "error": {
        const error = TURN_ERRORS[event.code] ?? ERRORS.generic;
        this.#store.updateMessage(answerId, () => ({ error }));
        break;
      }
      case "mcp_result":
        // Not sent yet: Backend turns off servers with `client` exposure
        break;
      default:
        // A newer Backend can send events that this client doesn't know
        console.warn("AiChat: unknown event", (event as { type: string }).type);
    }
  }
}
