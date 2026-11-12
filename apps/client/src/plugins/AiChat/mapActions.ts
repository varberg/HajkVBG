import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type OlMap from "ol/Map";

import type LayerControlModel from "../../models/LayerControlModel";
import type SearchModel from "../../models/SearchModel";
import type ToolControlModel from "../../models/ToolControlModel";

import type { ChatStore } from "./chatStore";
import { UI_STRINGS } from "./constants";
import {
  collectFeatures,
  downloadFeatures,
  hasGpxContent,
  routeName,
} from "./exportDrawn";
import type { RouteLayer } from "./routeLayer";
import type {
  AiChatApp,
  ChatAction,
  DownloadFormat,
  DrawnItems,
  FeatureSet,
  Preset,
  RouteAction,
  SearchSource,
} from "./types";

interface MapActionsOptions {
  app: AiChatApp;
  map: OlMap;
  routeLayer: RouteLayer;
  /** Where the notices and the download state of each answer go */
  store: Pick<ChatStore, "addNotice" | "updateMessage">;
}

/**
 * @summary What the chat does on the map: the actions from Backend, and what
 * each answer drew there, for the downloads.
 */
export class MapActions {
  #app: AiChatApp;
  #olMap: OlMap;
  #routeLayer: RouteLayer;
  #store: MapActionsOptions["store"];
  #layerControl: LayerControlModel;
  #toolControl: ToolControlModel;
  #presets: Preset[];
  /** What each answer drew, by its id, for the downloads */
  #drawn = new Map<number, DrawnItems>();
  /** Counts what was shown or cleared, so that a slow fetch can't win. */
  #routesShown = 0;
  /** Whether this conversation has put results in Search, that are still there */
  #searchShown = false;

  constructor({ app, map, routeLayer, store }: MapActionsOptions) {
    this.#app = app;
    this.#olMap = map;
    this.#routeLayer = routeLayer;
    this.#store = store;
    this.#layerControl = app.layerControl;
    this.#toolControl = app.toolControl;
    const { tools } = app.config.mapConfig as {
      tools: Array<{ type: string; options?: { presetList?: Preset[] } }>;
    };
    this.#presets =
      tools.find((tool) => tool.type === "preset")?.options?.presetList ?? [];
  }

  /** Forget what the answers drew, and remove it from the map */
  reset(): void {
    this.#drawn.clear();
    this.clearMap();
  }

  /**
   * @summary Remove the routes and the search results that the chat drew.
   * @description Search is only cleared if the chat put results there, so that
   * a search the user made without the chat is left alone.
   */
  clearMap(): void {
    this.#routesShown += 1;
    this.#routeLayer.clear();
    if (this.#searchShown && this.#getSearchModel() !== null) {
      this.#app.globalObserver.publish("search.clearResults");
    }
    this.#searchShown = false;
  }

  /**
   * @summary Download what an answer drew on the map, also after newer answers
   * have replaced it there. Routes that are unchecked on the map are left out.
   */
  download(answerId: number, format: DownloadFormat): void {
    const drawn = this.#drawn.get(answerId);
    if (drawn === undefined) {
      return;
    }
    const features = collectFeatures(
      drawn,
      this.#routeLayer,
      this.#app.plugins.search?.options ?? {}
    );
    const projection = this.#olMap.getView().getProjection();
    if (!downloadFeatures(format, features, projection)) {
      this.#store.addNotice(answerId, UI_STRINGS.nothingToDownload);
    }
  }

  /**
   * @summary Go to a place, the same way as picking it in the Preset control.
   * @returns False if the place isn't in the map config that was loaded, which
   * can happen if the config has changed since then
   */
  goToPlace(name: string): boolean {
    const preset = this.#presets.find((p) => p.name === name);
    if (preset === undefined) {
      return false;
    }
    this.#app.globalObserver.publish("preset.selectPreset", preset);
    return true;
  }

  /**
   * @summary Run an action from Backend, which has already checked that the
   * user may do it.
   * @param signal Aborts with the answer, for what is fetched along the way
   */
  runAction(action: ChatAction, answerId: number, signal: AbortSignal): void {
    switch (action.action) {
      case "open_plugin":
        // A tool in the map config isn't loaded unless it's in `availableTools` too
        if (!this.#toolControl.showTool(action.plugin)) {
          this.#store.addNotice(answerId, UI_STRINGS.pluginUnavailable);
        }
        break;
      case "close_plugin":
        this.#toolControl.hideTool(action.plugin);
        break;
      case "go_to_place":
        if (!this.goToPlace(action.place)) {
          this.#store.addNotice(answerId, UI_STRINGS.placeUnavailable);
        }
        break;
      case "set_background":
        this.#layerControl.showLayer(action.id);
        break;
      case "set_layer_visibility":
        action.ids.forEach((id) =>
          this.#layerControl.setLayerVisibility(id, action.visible)
        );
        break;
      case "show_features":
        this.#showFeatures(action.collections, answerId);
        break;
      case "show_route":
        void this.#showRoutes(action, answerId, signal);
        break;
      case "clear_features":
        if (this.#getSearchModel() === null) {
          this.#store.addNotice(answerId, UI_STRINGS.searchUnavailable);
        } else {
          // Asked for, so whatever is in Search goes, the user's own too
          this.#searchShown = true;
        }
        this.clearMap();
        break;
      default: {
        // Fails to compile when an action is added to ChatAction but not here
        const unknown: never = action;
        // A newer Backend can send actions that this client doesn't know
        console.warn("AiChat: unknown action", unknown);
        this.#store.addNotice(answerId, UI_STRINGS.eventFailed);
      }
    }
  }

  /** The search model exists even if Search isn't there, see App.jsx */
  #getSearchModel(): SearchModel | null {
    const search = this.#app.plugins.search;
    return search && search.options.renderElsewhere !== true
      ? (this.#app.searchModel ?? null)
      : null;
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
    this.#store.updateMessage(answerId, () => ({
      download: empty ? null : { gpx: hasGpxContent(drawn) },
    }));
  }

  #showFeatures(sets: FeatureSet[], answerId: number): void {
    const searchModel = this.#getSearchModel();
    if (searchModel === null) {
      this.#store.addNotice(answerId, UI_STRINGS.searchUnavailable);
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
      this.#app.globalObserver.publish(
        "search.showFeatureCollections",
        results
      );
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
  async #showRoutes(
    { routes }: RouteAction,
    answerId: number,
    signal: AbortSignal
  ): Promise<void> {
    const shown = ++this.#routesShown;
    this.#store.updateMessage(answerId, () => ({
      routes: routes.map((route) => route.summary),
      routesShownId: shown,
    }));
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
    if (shown !== this.#routesShown || signal.aborted) {
      return;
    }
    const collections = results.map((r) =>
      r.status === "fulfilled" ? r.value : null
    );
    this.#routeLayer.show(collections, shown);
    this.#addDrawn(answerId, () => ({
      routes: collections,
      routesShownId: shown,
      routeNames: routes.map(({ summary }, i) => routeName(summary, i)),
    }));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error("AiChat: couldn't show routes", failed);
      this.#store.addNotice(answerId, UI_STRINGS.routeUnavailable);
    }
  }
}
