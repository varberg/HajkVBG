import { UI_STRINGS } from "./constants";
import type { RouteSummary } from "./types";

export const number = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
});

export const amount = (value: number | null | undefined, unit: string) =>
  typeof value === "number" ? `${number.format(value)} ${unit}` : null;

/** 18 s, 4 min, 1 h 5 min – never parts of a minute such as 0,3 min */
export const duration = (minutes: number | null | undefined) => {
  if (typeof minutes !== "number") return null;
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds} ${UI_STRINGS.seconds}`;
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} ${UI_STRINGS.minutes}`;
  const hours = `${Math.floor(whole / 60)} ${UI_STRINGS.hours}`;
  const rest = whole % 60;
  return rest === 0 ? hours : `${hours} ${rest} ${UI_STRINGS.minutes}`;
};

export const tripsPerHour = (trips: number | null | undefined) =>
  typeof trips === "number"
    ? UI_STRINGS.tripsPerHour(number.format(trips))
    : null;

/** 235 m, 2,7 km */
export const walkDistance = (meters: number | null | undefined) =>
  typeof meters !== "number"
    ? null
    : meters < 1000
      ? `${Math.round(meters)} ${UI_STRINGS.meters}`
      : amount(meters / 1000, UI_STRINGS.km);

export const departuresPerHour = (departures: number | null | undefined) =>
  typeof departures === "number"
    ? UI_STRINGS.departuresPerHour(number.format(departures))
    : null;

export const joined = (...parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ");

/** @returns The name of the details of a route, or null if it has none */
export function detailsLabel(summary: RouteSummary): string | null {
  if ((summary.variants?.length ?? 0) > 0) return UI_STRINGS.stops;
  if ((summary.results?.length ?? 0) > 0) return UI_STRINGS.stops;
  if ((summary.steps?.length ?? 0) > 0) return UI_STRINGS.steps;
  if ((summary.legs?.length ?? 0) > 0) return UI_STRINGS.legs;
  if ((summary.streets?.length ?? 0) > 0) return UI_STRINGS.streets;
  return null;
}
