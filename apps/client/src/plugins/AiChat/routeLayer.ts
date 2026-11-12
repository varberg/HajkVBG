import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import VectorLayer from "ol/layer/Vector";
import type OlMap from "ol/Map";
import VectorSource from "ol/source/Vector";

import { styleOf } from "./routeStyles";

export { ROUTE_COLORS, routeColor } from "./routeStyles";

const FIT_PADDING = [60, 60, 60, 60];

/**
 * @summary The features of one route, with what `styleOf` needs to draw them.
 * Also used for the downloads, which must look the same.
 * @param collection GeoJSON in the map projection
 * @param route Its place among the routes, which gives its color
 */
export function readRoute(collection: object, route: number): Feature[] {
  const read = new GeoJSON().readFeatures(collection) as Feature[];
  const stops = read.filter((f) => f.get("kind") === "stop").length;
  read.forEach((f) =>
    f.setProperties({
      route,
      numbered: stops > 2,
      // The server numbers the stops from 1, in the order travelled
      first: f.get("nr") === 1,
      last: stops > 1 && f.get("nr") === stops,
    })
  );
  return read;
}

/**
 * @summary The routes and reachable areas that the chat shows. A system layer,
 * so it's left out of the map state and the layer switcher. It's added to the
 * map on first use, and what is shown replaces what was shown before.
 * @description Each showing has an id, so that the controls under an answer
 * only work while its routes are the ones on the map.
 */
export class RouteLayer {
  #map: OlMap;
  #source = new VectorSource({ wrapX: false });
  #layer: VectorLayer | null = null;
  /** The showing on the map, or null if nothing is */
  #shownId: number | null = null;
  /** The routes that have something on the map */
  #drawn = new Set<number>();
  #hidden = new Set<number>();
  #listeners = new Set<() => void>();

  constructor(map: OlMap) {
    this.#map = map;
  }

  /**
   * @param collections GeoJSON in the map projection, one per route. A route
   * that couldn't be fetched is null, and keeps its color for the others.
   * @param shownId Tells this showing apart from the ones before it
   */
  show(collections: Array<object | null>, shownId: number): void {
    if (this.#layer === null) {
      this.#layer = new VectorLayer({
        source: this.#source,
        style: (feature) => styleOf(feature as Feature, this.#hidden),
        // Routes from one place share their start, and its name once is enough
        declutter: true,
        zIndex: 5000,
        properties: {
          layerType: "system",
          name: "pluginAiChatRoute",
          caption: "AI-chatt - rutt",
          queryable: false,
        },
      });
      this.#map.addLayer(this.#layer);
    }

    const features = collections.flatMap((collection, route) =>
      collection === null ? [] : readRoute(collection, route)
    );

    this.#shownId = shownId;
    this.#hidden.clear();
    this.#drawn = new Set(
      collections.flatMap((collection, route) =>
        collection === null ? [] : [route]
      )
    );
    this.#source.clear();
    this.#source.addFeatures(features);
    this.#notify();
    const extent = this.#source.getExtent();
    if (features.length > 0 && extent !== null) {
      this.#map.getView().fit(extent, {
        padding: FIT_PADDING,
        duration: 500,
        maxZoom: 16,
      });
    }
  }

  clear(): void {
    this.#shownId = null;
    this.#drawn.clear();
    this.#source.clear();
    this.#notify();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /**
   * @returns Whether a route of a showing is visible, or null if it isn't on
   * the map, because it has been replaced, cleared or couldn't be fetched
   */
  isVisible = (shownId: number, route: number): boolean | null =>
    shownId === this.#shownId && this.#drawn.has(route)
      ? !this.#hidden.has(route)
      : null;

  setVisible = (shownId: number, route: number, visible: boolean): void => {
    if (this.isVisible(shownId, route) === null) {
      return;
    }
    if (visible) {
      this.#hidden.delete(route);
    } else {
      this.#hidden.add(route);
    }
    this.#layer?.changed();
    this.#notify();
  };

  #notify(): void {
    this.#listeners.forEach((listener) => listener());
  }
}
