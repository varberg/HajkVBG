import type Feature from "ol/Feature";
import { asArray } from "ol/color";
import {
  Circle as CircleStyle,
  Fill,
  Icon,
  Stroke,
  Style,
  Text,
} from "ol/style";

/** One per route, in the order of the routes. Also used by RouteCard. */
export const ROUTE_COLORS = [
  "#1565c0",
  "#c62828",
  "#2e7d32",
  "#ef6c00",
  "#6a1b9a",
  "#00838f",
  "#ad1457",
  "#4e342e",
  "#9e9d24",
  "#37474f",
];

export const routeColor = (index: number): string =>
  ROUTE_COLORS[index % ROUTE_COLORS.length];

const translucent = (color: string, alpha: number) => {
  const [r, g, b] = asArray(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const lineStyles = new Map<string, Style>();

/** By the `kind` the server gives: a bus ride or line is wide, a walk dashed */
const LINE_WIDTHS: Record<string, number> = {
  reachable_roads: 2,
  ride: 5,
  line: 5,
};

/** A walking route is drawn as the walks of a transit trip. Not an area. */
const lineKind = (feature: Feature): string =>
  feature.get("kind") === "leg" && feature.get("mode") === "walk"
    ? "walk"
    : feature.get("kind");

function lineStyle(kind: string, color: string): Style {
  const key = `${kind}:${color}`;
  let style = lineStyles.get(key);
  if (style === undefined) {
    style =
      kind === "hull"
        ? new Style({
            fill: new Fill({ color: translucent(color, 0.12) }),
            stroke: new Stroke({ color, width: 1, lineDash: [6, 6] }),
          })
        : new Style({
            stroke: new Stroke({
              color,
              width: LINE_WIDTHS[kind] ?? 3,
              lineCap: "round",
              lineDash: kind === "walk" ? [6, 8] : undefined,
            }),
          });
    lineStyles.set(key, style);
  }
  return style;
}

/**
 * A road closed by `avoid`: dashed red on white, whatever the route's color,
 * so that it can't be taken for a part of the route. It lies under the routes.
 */
export const AVOIDED_KIND = "avoided_road";
const AVOIDED_STYLE = [
  new Style({
    stroke: new Stroke({ color: "#ffffff", width: 6, lineCap: "butt" }),
    zIndex: -1,
  }),
  new Style({
    stroke: new Stroke({
      color: "#d32f2f",
      width: 3,
      lineCap: "butt",
      lineDash: [6, 6],
    }),
    zIndex: -1,
  }),
];

/** One style per feature in a download, so without the white edge */
const AVOIDED_EXPORT_STYLE = new Style({
  stroke: new Stroke({ color: "#d32f2f", width: 3, lineDash: [6, 6] }),
});

// Bright green (#00c853) and red (#ff1744), each mixed with 10 % white
const START_FILL = "#1ace64";
const END_FILL = "#ff2e57";

/** The start is green and the end red, and the stops in between white. */
function stopFill(feature: Feature): string | null {
  if (feature.get("first") === true) return START_FILL;
  if (feature.get("last") === true) return END_FILL;
  return null;
}

/**
 * A stop gets its name, and its number when the route has more than two.
 * @description The circle and number are always drawn and left out of the
 * decluttering, as a name placed under its own circle would otherwise collide
 * with it and never show. So names only hide each other, and a start shared by
 * many routes shows its name once.
 */
function stopStyle(feature: Feature, color: string): Style[] {
  const numbered = feature.get("numbered") === true;
  const radius = numbered ? 10 : 7;
  const fill = stopFill(feature);
  return [
    new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: fill ?? "#ffffff" }),
        stroke: new Stroke({ color, width: 3 }),
        declutterMode: "none",
      }),
      text: numbered
        ? new Text({
            text: String(feature.get("nr") ?? ""),
            font: "bold 11px sans-serif",
            fill: new Fill({ color: fill === null ? color : "#ffffff" }),
            declutterMode: "none",
          })
        : undefined,
    }),
    new Style({
      text: new Text({
        text: String(feature.get("label") ?? ""),
        font: "12px sans-serif",
        textBaseline: "top",
        offsetY: radius + 4,
        fill: new Fill({ color: "#212121" }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
      }),
    }),
  ];
}

const LINE_STOP_RADIUS = 6;

/** A public transport stop, smaller than the stops of a route */
function lineStopStyle(feature: Feature, color: string): Style {
  return new Style({
    image: new CircleStyle({
      radius: LINE_STOP_RADIUS,
      fill: new Fill({ color: "#ffffff" }),
      stroke: new Stroke({ color, width: 2 }),
      declutterMode: "none",
    }),
    text: new Text({
      text: String(feature.get("stop") ?? ""),
      font: "11px sans-serif",
      textAlign: "left",
      offsetX: LINE_STOP_RADIUS + 7,
      fill: new Fill({ color: "#212121" }),
      stroke: new Stroke({ color: "#ffffff", width: 3 }),
    }),
  });
}

export function styleOf(
  feature: Feature,
  hidden: Set<number>
): Style | Style[] {
  const route = feature.get("route") ?? 0;
  if (hidden.has(route)) {
    return [];
  }
  const color = routeColor(route);
  switch (feature.get("kind")) {
    case "stop":
    case "point":
      return stopStyle(feature, color);
    case "line_stop":
    case "transit_stop":
      return lineStopStyle(feature, color);
    case AVOIDED_KIND:
      return AVOIDED_STYLE;
    default:
      return lineStyle(lineKind(feature), color);
  }
}

// ---- For the downloads, see exportDrawn.ts ----

// Drawn large and scaled down, so that it stays sharp when zoomed in
const ICON_PIXELS = 64;
const stopIcons = new Map<string, string>();

/** A stop as a PNG, since KML can only give a point an image */
function stopIconSrc(fill: string, color: string, nr: string, radius: number) {
  const key = `${fill}|${color}|${nr}|${radius}`;
  let src = stopIcons.get(key);
  if (src === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ICON_PIXELS;
    const context = canvas.getContext("2d")!;
    // The edge is 3 wide and centered on the circle, so it reaches 1.5 outside
    const scale = ICON_PIXELS / (2 * radius + 3);
    const center = ICON_PIXELS / 2;
    context.beginPath();
    context.arc(center, center, radius * scale, 0, 2 * Math.PI);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 3 * scale;
    context.strokeStyle = color;
    context.stroke();
    if (nr !== "") {
      context.font = `bold ${Math.round(11 * scale)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = fill === "#ffffff" ? color : "#ffffff";
      context.fillText(nr, center, center);
    }
    src = canvas.toDataURL("image/png");
    stopIcons.set(key, src);
  }
  return src;
}

/**
 * @summary One plain style per feature, as on the map, for a feature from
 * `readRoute`. A KML file can't hold a style function.
 * @description A stop becomes an image with its name as the label. The stroke
 * of a stop isn't drawn, but gives GeoJSON its marker color. KML has no dashed
 * lines, so the dashes are kept for Hajk only, see `hajkStyleOf`.
 */
export function exportStyleOf(feature: Feature): Style {
  const color = routeColor(feature.get("route") ?? 0);
  const kind = feature.get("kind");
  if (kind === "line_stop" || kind === "transit_stop") {
    return new Style({
      image: new Icon({
        src: stopIconSrc("#ffffff", color, "", LINE_STOP_RADIUS),
        size: [ICON_PIXELS, ICON_PIXELS],
        scale: (2 * LINE_STOP_RADIUS + 3) / ICON_PIXELS,
      }),
      text: new Text({
        text: String(feature.get("stop") ?? ""),
        fill: new Fill({ color: "#212121" }),
      }),
      stroke: new Stroke({ color }),
    });
  }
  if (kind === AVOIDED_KIND) {
    return AVOIDED_EXPORT_STYLE;
  }
  if (kind !== "stop" && kind !== "point") {
    return lineStyle(lineKind(feature), color);
  }
  const numbered = feature.get("numbered") === true;
  const radius = numbered ? 10 : 7;
  const fill = stopFill(feature) ?? "#ffffff";
  const nr = numbered ? String(feature.get("nr") ?? "") : "";
  return new Style({
    image: new Icon({
      src: stopIconSrc(fill, color, nr, radius),
      size: [ICON_PIXELS, ICON_PIXELS],
      scale: (2 * radius + 3) / ICON_PIXELS,
    }),
    text: new Text({
      text: String(feature.get("label") ?? ""),
      fill: new Fill({ color: "#212121" }),
    }),
    stroke: new Stroke({ color }),
  });
}

/**
 * @summary A dashed line or area in the form Sketch saves its style in KML, so
 * that it's dashed again when imported into Hajk. Other viewers ignore it.
 * @param feature With a style from `exportStyleOf`
 * @returns JSON for the `EXTRACTED_STYLE` property, or null if it isn't dashed
 */
export function hajkStyleOf(feature: Feature): string | null {
  const style = feature.getStyle();
  const stroke = style instanceof Style ? style.getStroke() : null;
  const dash = stroke?.getLineDash();
  if (
    !stroke ||
    !dash?.length ||
    /Point$/.test(feature.getGeometry()?.getType() ?? "")
  ) {
    return null;
  }
  const rgba = (color: unknown) => {
    const [r, g, b, a] = asArray(color as string);
    return `rgba(${r},${g},${b},${a})`;
  };
  const fill = (style as Style).getFill()?.getColor();
  return JSON.stringify({
    strokeStyle: {
      color: rgba(stroke.getColor()),
      dash,
      width: stroke.getWidth(),
    },
    fillStyle: fill ? { color: rgba(fill) } : null,
    imageStyle: null,
    zIndex: 0,
  });
}
