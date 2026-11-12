import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type OlMap from "ol/Map";

import type LayerControlModel from "../../models/LayerControlModel";
import type SearchModel from "../../models/SearchModel";
import type ToolControlModel from "../../models/ToolControlModel";
import { hfetch } from "../../utils/FetchWrapper";

import { ERRORS, REQUEST_ERRORS, TURN_ERRORS, UI_STRINGS } from "./constants";
import { DrawnFeatures } from "./drawnFeatures";
import {
  collectFeatures,
  downloadFeatures,
  hasGpxContent,
  routeName,
} from "./exportDrawn";
import { RouteLayer } from "./routeLayer";
import { readEvents } from "./sse";
import type {
  AiChatApp,
  AiChatOptions,
  ChatAction,
  ChatEvent,
  ChatMessage,
  ChatState,
  DownloadFormat,
  DrawnItems,
  FeatureSet,
  LayerSnapshot,
  Preset,
  PresentedLayer,
  RouteAction,
  SearchSource,
  SharedDrawing,
} from "./types";

const EMPTY_STATE: ChatState = {
  messages: [],
  running: false,
  activeTool: null,
  includeDrawn: false,
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
  #olMap: OlMap;
  readonly routeLayer: RouteLayer;
  /** What the user has drawn with Sketch, or null if the map doesn't allow it */
  readonly drawings: DrawnFeatures | null;
  /** What each answer drew, by its id, for the downloads */
  #drawn = new Map<number, DrawnItems>();
  /** Counts what was shown or cleared, so that a slow fetch can't win. */
  #routesShown = 0;
  /** Whether this conversation has put results in Search, that are still there */
  #searchShown = false;
  #state: ChatState = EMPTY_STATE;
  #listeners = new Set<() => void>();
  #conversationId: string | null = null;
  #abort: AbortController | null = null;
  #nextMessageId = 1;
  #notifyScheduled = false;

  constructor(app: AiChatApp, map: OlMap, options: AiChatOptions = {}) {
    this.#app = app;
    this.#olMap = map;
    this.routeLayer = new RouteLayer(map);
    this.drawings =
      options.drawnFeatures === false ? null : new DrawnFeatures(map);
    // With nothing drawn there's nothing to take, and the next drawing starts off
    this.drawings?.subscribe(() => {
      if (this.drawings?.getCount() === 0 && this.#state.includeDrawn) {
        this.#setState({ includeDrawn: false });
      }
    });
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

  /** Whether the next question takes what the user has drawn */
  setIncludeDrawn = (include: boolean): void => {
    this.#setState({
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
    this.#drawn.clear();
    this.#clearMap();
    // About the drawings, not the conversation, so it stays as the user left it
    this.#setState({ ...EMPTY_STATE, includeDrawn: this.#state.includeDrawn });
  };

  /**
   * @summary Remove the routes and the search results that the chat drew.
   * @description Search is only cleared if the chat put results there, so that
   * a search the user made without the chat is left alone.
   */
  #clearMap(): void {
    this.#routesShown += 1;
    this.routeLayer.clear();
    if (this.#searchShown && this.#getSearchModel() !== null) {
      this.#globalObserver.publish("search.clearResults");
    }
    this.#searchShown = false;
  }

  /**
   * @summary Download what an answer drew on the map, also after newer answers
   * have replaced it there. Routes that are unchecked on the map are left out.
   */
  download = (answerId: number, format: DownloadFormat): void => {
    const drawn = this.#drawn.get(answerId);
    if (drawn === undefined) {
      return;
    }
    const features = collectFeatures(
      drawn,
      this.routeLayer,
      this.#app.plugins.search?.options ?? {}
    );
    const projection = this.#olMap.getView().getProjection();
    if (!downloadFeatures(format, features, projection)) {
      this.#addNotice(answerId, UI_STRINGS.nothingToDownload);
    }
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
    // Read once, so that a question asked again after a lost conversation
    // takes the same drawings
    const drawn =
      this.#state.includeDrawn && this.drawings ? this.drawings.collect() : [];
    const question = {
      ...this.#createMessage("user", message),
      drawnShared: drawn.length,
    };
    const answer = this.#createMessage("assistant", "");
    this.#setState({
      running: true,
      activeTool: null,
      messages: [...this.#state.messages, question, answer],
    });

    try {
      await this.#runTurn(message, drawn, answer.id, abort.signal);
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error("AiChat: the answer failed", error);
      }
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
      drawnShared: 0,
      layers: [],
      routes: [],
      routesShownId: null,
      download: null,
      notices: [],
      error: null,
      stopped: false,
    };
  }

  #setState(state: Partial<ChatState>): void {
    this.#state = { ...this.#state, ...state };
    this.#scheduleNotify();
  }

  /**
   * @summary Tell the view once per frame, not once per event.
   * @description One network chunk can hold hundreds of text events, read one
   * microtask after another. Each update of an external store renders at once,
   * so React would see that as an update loop and throw "Maximum update depth
   * exceeded", which ended the answer.
   */
  #scheduleNotify(): void {
    if (this.#notifyScheduled) {
      return;
    }
    this.#notifyScheduled = true;
    requestAnimationFrame(() => {
      this.#notifyScheduled = false;
      this.#listeners.forEach((listener) => listener());
    });
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

  #post(
    message: string,
    drawn: SharedDrawing[],
    signal: AbortSignal
  ): Promise<Response> {
    return hfetch(this.#url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        map: this.#map,
        conversationId: this.#conversationId,
        message,
        mapState: { ...this.#getMapState(), drawn },
      }),
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
      this.#addNotice(answerId, UI_STRINGS.conversationRestarted);
      response = await this.#post(message, drawn, signal);
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
      // A throw here would end the stream, and Backend would drop the turn. A
      // plugin that fails to show something shouldn't cost the whole answer.
      try {
        this.#handleEvent(chatEvent, answerId);
      } catch (error) {
        console.error(`AiChat: couldn't handle a ${event} event`, error);
        this.#addNotice(answerId, UI_STRINGS.eventFailed);
      }
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

  #addDrawn(
    answerId: number,
    update: (drawn: DrawnItems) => Partial<DrawnItems>
  ): void {
    const before = this.#drawn.get(answerId) ?? {
      routes: [],
      routesShownId: null,
      routeNames: [],
      features: [],
    };
    const drawn = { ...before, ...update(before) };
    this.#drawn.set(answerId, drawn);
    const empty =
      drawn.routes.every((route) => route === null) &&
      drawn.features.length === 0;
    this.#updateMessage(answerId, () => ({
      download: empty ? null : { gpx: hasGpxContent(drawn) },
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
    const results = sets.map(({ source, featureCollection }) => ({
      // A source for the chat only isn't in Search, so the backend sends along
      // what the panel needs. Search's own has more, such as secondary labels.
      source: sources.find(({ id }) => id === source.id) ?? source,
      origin: "WFS" as const,
      value: {
        features: (format.readFeatures(featureCollection) as Feature[]).map(
          // Not a property, which would end up in the infobox and in exports.
          // Search's FeatureStyle then draws the points with the marker.
          (feature) => Object.assign(feature, { useMarkerIcon: true })
        ),
      },
    }));

    if (results.length > 0) {
      this.#globalObserver.publish("search.showFeatureCollections", results);
      this.#searchShown = true;
      this.#addDrawn(answerId, ({ features }) => ({
        features: [...features, ...results.flatMap((r) => r.value.features)],
      }));
    }
  }

  /**
   * @summary Show the details under the answer, and fetch the geometry straight
   * from the MCP server, so it never passes Backend or the model.
   */
  async #showRoutes({ routes }: RouteAction, answerId: number): Promise<void> {
    const shown = ++this.#routesShown;
    this.#updateMessage(answerId, () => ({
      routes: routes.map((route) => route.summary),
      routesShownId: shown,
    }));
    const signal = this.#abort?.signal;
    // Cross-origin calls to another server, so no cookies and not hfetch
    const results = await Promise.allSettled(
      routes.map(async ({ url }) => {
        const response = await fetch(url, { credentials: "omit", signal });
        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }
        return (await response.json()) as object;
      })
    );
    // Routes shown or cleared since then win, however slow these were
    if (shown !== this.#routesShown || signal?.aborted) {
      return;
    }
    const collections = results.map((r) =>
      r.status === "fulfilled" ? r.value : null
    );
    this.routeLayer.show(collections, shown);
    this.#addDrawn(answerId, () => ({
      routes: collections,
      routesShownId: shown,
      routeNames: routes.map(({ summary }, i) => routeName(summary, i)),
    }));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error("AiChat: couldn't show routes", failed);
      this.#addNotice(answerId, UI_STRINGS.routeUnavailable);
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
    if (action.action === "show_route") {
      void this.#showRoutes(action, answerId);
      return;
    }
    if (action.action === "clear_features") {
      if (this.#getSearchModel() === null) {
        this.#addNotice(answerId, UI_STRINGS.searchUnavailable);
      } else {
        // Asked for, so whatever is in Search goes, the user's own too
        this.#searchShown = true;
      }
      this.#clearMap();
      return;
    }
    action.ids.forEach((id) =>
      this.#layerControl.setLayerVisibility(id, action.visible)
    );
  }
}
