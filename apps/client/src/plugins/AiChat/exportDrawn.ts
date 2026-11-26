import { saveAs } from "file-saver";
import Feature from "ol/Feature";
import { asArray } from "ol/color";
import GeoJSON from "ol/format/GeoJSON";
import GPX from "ol/format/GPX";
import KML from "ol/format/KML";
import { LineString, MultiLineString, MultiPoint } from "ol/geom";
import type { ProjectionLike } from "ol/proj";
import type { Style } from "ol/style";

import FeatureStyle from "../../components/Search/utils/FeatureStyle";

import { UI_STRINGS } from "./constants";
import { duration } from "./routeFormat";
import { readRoute, type RouteLayer } from "./routeLayer";
import { AVOIDED_KIND, exportStyleOf, hajkStyleOf } from "./routeStyles";
import type { DownloadFormat, DrawnItems, RouteSummary } from "./types";

/**
 * @summary Download what an answer drew on the map, as KML, GPX or GeoJSON.
 * @description All three are written in WGS84, as the formats expect. Only KML
 * has styles, so each feature gets a plain copy of its style on the map, and a
 * dashed one its dashes in the form Hajk's Sketch reads. GPX
 * can't hold areas, and leaves them out, as well as the roads a route avoided.
 */

const FILES: Record<DownloadFormat, { type: string; extension: string }> = {
  kml: {
    type: "application/vnd.google-earth.kml+xml;charset=utf-8",
    extension: "kml",
  },
  gpx: { type: "application/gpx+xml;charset=utf-8", extension: "gpx" },
  geojson: { type: "application/geo+json;charset=utf-8", extension: "geojson" },
};

/** Properties that only tell the map how to draw a route */
const DRAWING_ONLY = ["numbered", "first", "last"];

const isArea = (feature: Feature) =>
  /Polygon$/.test(feature.getGeometry()?.getType() ?? "");

export function routeName(summary: RouteSummary, index: number): string {
  if (summary.tool === "nearest_stops") {
    return UI_STRINGS.nearestStops;
  }
  if (summary.tool === "line_info") {
    return [UI_STRINGS.line, summary.line].filter(Boolean).join(" ");
  }
  if (summary.tool === "reachable_within") {
    return [UI_STRINGS.reach, summary.from].filter(Boolean).join(" ");
  }
  const places =
    summary.from && summary.to ? `: ${summary.from} → ${summary.to}` : "";
  return `${UI_STRINGS.route} ${index + 1}${places}`;
}

/**
 * A place by its label, a public transport stop by its name, closed roads as
 * such, a reachable area by its time, else the route
 */
function featureName(feature: Feature, routeName: string): string {
  switch (feature.get("kind")) {
    case AVOIDED_KIND:
      return `${routeName} – ${UI_STRINGS.closedRoads.toLowerCase()}`;
    case "stop":
    case "point":
      return feature.get("label");
    case "line_stop":
    case "transit_stop":
      return feature.get("stop");
    case "isochrone": {
      const time = duration(feature.get("minutes"));
      return time === null ? routeName : `${routeName} – ${time}`;
    }
    default:
      return routeName;
  }
}

/** Whether a GPX file would have anything in it */
export const hasGpxContent = (drawn: DrawnItems): boolean =>
  drawn.routes.some((route) => route !== null) ||
  drawn.features.some((feature) => !isArea(feature));

/**
 * @returns Copies of what was drawn, with a name and a plain style each. Routes
 * that are unchecked on the map are left out.
 */
export function collectFeatures(
  drawn: DrawnItems,
  routeLayer: RouteLayer,
  searchOptions: object
): Feature[] {
  const { routesShownId } = drawn;
  const routes = drawn.routes.flatMap((collection, route) => {
    const hidden =
      routesShownId !== null &&
      routeLayer.isVisible(routesShownId, route) === false;
    if (collection === null || hidden) {
      return [];
    }
    return readRoute(collection, route).map((feature) => {
      feature.setStyle(exportStyleOf(feature));
      DRAWING_ONLY.forEach((key) => feature.unset(key));
      feature.setProperties({
        name: featureName(feature, drawn.routeNames[route]),
        // Counted from 1, as in the answer
        route: route + 1,
      });
      return feature;
    });
  });

  // The same style as Search gives them on the map
  const featureStyle = new FeatureStyle(searchOptions);
  const features = drawn.features.map((original) => {
    const copy = original.clone();
    const title = (original as Feature & { featureTitle?: string })
      .featureTitle;
    if (title && copy.get("name") === undefined) {
      copy.set("name", title);
    }
    copy.setStyle(featureStyle.getDefaultSearchResultStyle(original) as Style);
    return copy;
  });

  return [...routes, ...features];
}

/** GPX has points, routes and tracks. A GPS recalculates a route, so tracks. */
function toGpxFeatures(features: Feature[]): Feature[] {
  const gpx = features.flatMap((feature) => {
    // Closed roads aren't part of the route, and a GPS would follow them
    if (feature.get("kind") === AVOIDED_KIND) {
      return [];
    }
    const geometry = feature.getGeometry();
    if (geometry instanceof LineString) {
      feature.setGeometry(new MultiLineString([geometry.getCoordinates()]));
      return [feature];
    }
    if (geometry instanceof MultiPoint) {
      return geometry
        .getPoints()
        .map(
          (point) => new Feature({ name: feature.get("name"), geometry: point })
        );
    }
    return geometry?.getType() === "Point" ||
      geometry instanceof MultiLineString
      ? [feature]
      : [];
  });
  // The points come first in a GPX file
  const isPoint = (f: Feature) => f.getGeometry()?.getType() === "Point";
  return [...gpx.filter(isPoint), ...gpx.filter((f) => !isPoint(f))];
}

const hexAndOpacity = (color: unknown): [string, number] | null => {
  if (typeof color !== "string" && !Array.isArray(color)) {
    return null;
  }
  const [r, g, b, a] = asArray(color as string);
  const hex = [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  return [`#${hex}`, a];
};

/**
 * The colors as simplestyle properties, which isn't a standard but is read
 * by geojson.io and other viewers
 */
function simpleStyle(feature: Feature): Record<string, unknown> {
  const style = feature.getStyle() as Style;
  const stroke = hexAndOpacity(style.getStroke()?.getColor());
  const fill = hexAndOpacity(style.getFill()?.getColor());
  const type = feature.getGeometry()?.getType() ?? "";
  if (/Point$/.test(type)) {
    const color = (fill ?? stroke)?.[0];
    return color ? { "marker-color": color } : {};
  }
  return {
    ...(stroke && {
      stroke: stroke[0],
      "stroke-opacity": stroke[1],
      "stroke-width": style.getStroke()?.getWidth() ?? 1,
    }),
    ...(fill && isArea(feature) && { fill: fill[0], "fill-opacity": fill[1] }),
  };
}

function write(
  format: DownloadFormat,
  features: Feature[],
  featureProjection: ProjectionLike
): string | null {
  const options = { featureProjection, dataProjection: "EPSG:4326" };
  if (format === "kml") {
    features.forEach((feature) => {
      const hajkStyle = hajkStyleOf(feature);
      if (hajkStyle !== null) {
        feature.set("EXTRACTED_STYLE", hajkStyle);
      }
    });
    return new KML().writeFeatures(features, options);
  }
  if (format === "gpx") {
    const gpx = toGpxFeatures(features);
    return gpx.length > 0 ? new GPX().writeFeatures(gpx, options) : null;
  }
  features.forEach((feature) => {
    feature.setProperties(simpleStyle(feature));
    if (feature.get("title") === undefined && feature.get("name")) {
      feature.set("title", feature.get("name"));
    }
  });
  return new GeoJSON().writeFeatures(features, { ...options, decimals: 7 });
}

/** @returns False if there was nothing to download */
export function downloadFeatures(
  format: DownloadFormat,
  features: Feature[],
  featureProjection: ProjectionLike
): boolean {
  const text =
    features.length > 0 ? write(format, features, featureProjection) : null;
  if (text === null) {
    return false;
  }
  const { type, extension } = FILES[format];
  // Colons aren't allowed in file names on Windows
  const stamp = new Date().toLocaleString("sv-SE").replace(/:/g, ".");
  saveAs(new Blob([text], { type }), `AI-chatt ${stamp}.${extension}`);
  return true;
}
