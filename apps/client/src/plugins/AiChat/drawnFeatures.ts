import { useSyncExternalStore } from "react";

import type Feature from "ol/Feature";
import type { EventsKey } from "ol/events";
import GeoJSON from "ol/format/GeoJSON";
import { Circle } from "ol/geom";
import type { Geometry } from "ol/geom";
import { fromCircle } from "ol/geom/Polygon";
import type BaseLayer from "ol/layer/Base";
import type VectorLayer from "ol/layer/Vector";
import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import type VectorSource from "ol/source/Vector";

import { maskPersonalNumbers } from "./personalNumbers";
import type { SharedDrawing } from "./types";

/** The layer Sketch draws in, see Sketch.jsx */
const SKETCH_LAYER = "pluginSketch";

// The same limits as Backend, see services/ai/features/drawn.ts. Backend has a
// limit on all vertices together too, and leaves out what goes over it.
export const MAX_DRAWN = 20;
const MAX_VERTICES = 1000;
const CIRCLE_SIDES = 64;

const vertexCount = (geometry: Geometry): number => {
  const simple = geometry as Geometry & {
    getFlatCoordinates?: () => number[];
    getStride?: () => number;
  };
  return simple.getFlatCoordinates && simple.getStride
    ? simple.getFlatCoordinates().length / simple.getStride()
    : 0;
};

/**
 * @summary A geometry that GeoJSON can hold, with few enough vertices. A
 * freehand line can have thousands, which says no more than a few hundred.
 */
function shareable(original: Geometry): Geometry {
  let geometry =
    original instanceof Circle ? fromCircle(original, CIRCLE_SIDES) : original;
  for (
    let tolerance = 0.5;
    vertexCount(geometry) > MAX_VERTICES && tolerance < 10_000;
    tolerance *= 2
  ) {
    geometry = original.simplify(tolerance);
  }
  return geometry;
}

/**
 * @summary What the user has drawn with Sketch, for the chat to use when the
 * user turns it on. Only reads the layer, and never changes it.
 * @description Sketch adds its layer when it's first used, so the layer is
 * looked for again when layers come and go. Only finished drawings count: not
 * text labels, and not drawings the user has hidden.
 */
export class DrawnFeatures {
  #map: OlMap;
  #source: VectorSource | null = null;
  #keys: EventsKey[] = [];
  /** Kept per drawing, so that the model can refer to one across messages */
  #ids = new WeakMap<Feature, string>();
  #nextId = 1;
  #count = 0;
  #listeners = new Set<() => void>();

  constructor(map: OlMap) {
    this.#map = map;
    map.getLayers().on(["add", "remove"], this.#attach);
    this.#attach();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** How many drawings there are now */
  getCount = (): number => this.#count;

  /**
   * @returns The drawings to send, at most MAX_DRAWN, as GeoJSON in the map
   * projection. Read when the message is sent, so it's always up to date.
   */
  collect(): SharedDrawing[] {
    const format = new GeoJSON();
    return this.#drawings()
      .slice(0, MAX_DRAWN)
      .map((feature) => {
        const title = feature.get("FEATURE_TITLE");
        return {
          id: this.#idOf(feature),
          title:
            typeof title === "string" && title.trim()
              ? maskPersonalNumbers(title)
              : null,
          geometry: format.writeGeometryObject(
            shareable(feature.getGeometry()!)
          ),
        };
      });
  }

  #attach = (): void => {
    const layer = this.#map
      .getLayers()
      .getArray()
      .find((l: BaseLayer) => l.get("name") === SKETCH_LAYER) as
      VectorLayer | undefined;
    const source = (layer?.getSource() as VectorSource | null) ?? null;
    if (source === this.#source) {
      return;
    }
    unByKey(this.#keys);
    this.#source = source;
    this.#keys =
      source === null
        ? []
        : [
            source.on("addfeature", this.#update),
            source.on("removefeature", this.#update),
            source.on("changefeature", this.#update),
            source.on("clear", this.#update),
            // Hiding a drawing only sets a property, which Sketch follows by
            // redrawing the layer
            source.on("change", this.#update),
          ];
    this.#update();
  };

  #update = (): void => {
    const count = this.#drawings().length;
    if (count !== this.#count) {
      this.#count = count;
      this.#listeners.forEach((listener) => listener());
    }
  };

  #drawings(): Feature[] {
    return (this.#source?.getFeatures() ?? []).filter(
      (feature) =>
        feature.get("USER_DRAWN") === true &&
        feature.get("HIDDEN") !== true &&
        feature.get("DRAW_METHOD") !== "Text" &&
        feature.getGeometry() !== undefined
    );
  }

  #idOf(feature: Feature): string {
    let id = this.#ids.get(feature);
    if (id === undefined) {
      id = `s${this.#nextId++}`;
      this.#ids.set(feature, id);
    }
    return id;
  }
}

const noDrawings = () => () => {};
const zero = () => 0;

/** Follows Sketch, so that it shows up and goes away as the user draws */
export function useDrawnCount(drawings: DrawnFeatures | null): number {
  return useSyncExternalStore(
    drawings?.subscribe ?? noDrawings,
    drawings?.getCount ?? zero
  );
}
