import type { UserCatalog } from "./access.service.ts";
import { describeDrawn, sanitizeDrawn } from "./features/drawn.ts";
import type { DrawnFeature } from "./features/drawn.ts";

/** What the browser reports as being on the map right now. */
export interface MapState {
  layers: Array<{ id: string; visibleSubLayers: string[] }>;
  background: string | null;
  /** What the user drew and chose to share, see drawn.ts */
  drawn: DrawnFeature[];
  /** Drawn features that failed the checks or the limits */
  drawnSkipped: number;
  /** As YYYY-MM-DD, for questions such as which road works are going on */
  today: string;
}

/** The date where the backend runs, which is where the map is */
export const localDate = (date: Date = new Date()): string =>
  date.toLocaleDateString("sv-SE");

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/**
 * @summary Limit a map state from the browser to what the user may reach.
 * @description The browser can send anything, so only ids found in the user's
 * catalog survive. That also keeps free text out of the prompt: all that is
 * shown to the model later comes from the catalog. The result is sorted, so two
 * states that differ only in order are equal.
 */
export function sanitizeMapState(
  raw: unknown,
  userCatalog: UserCatalog,
  today: string = localDate()
): MapState {
  const { allowed, recordsById, mapInfo } = userCatalog;
  const input = (raw ?? {}) as {
    layers?: unknown;
    background?: unknown;
    drawn?: unknown;
  };
  const entries = Array.isArray(input.layers) ? input.layers : [];

  const layers = new Map<string, string[]>();
  for (const entry of entries as Array<Record<string, unknown> | null>) {
    const id = entry?.id;
    if (typeof id === "string" && allowed.layers.has(id)) {
      const known = new Set(recordsById.get(id)?.subLayers.map((s) => s.id));
      const subLayers = strings(entry?.visibleSubLayers).filter((s) =>
        known.has(s)
      );
      layers.set(id, [...new Set(subLayers)].sort(compare));
    }
  }

  const { background } = input;
  // A map that doesn't take them ignores them, whatever the browser sends
  const drawn = mapInfo.drawnFeatures
    ? sanitizeDrawn(input.drawn, mapInfo.extent)
    : { features: [], skipped: 0 };
  return {
    layers: [...layers]
      .map(([id, visibleSubLayers]) => ({ id, visibleSubLayers }))
      .sort((a, b) => compare(a.id, b.id)),
    background:
      typeof background === "string" && allowed.backgrounds.has(background)
        ? background
        : null,
    drawn: drawn.features,
    drawnSkipped: drawn.skipped,
    today,
  };
}

/**
 * @summary A map state as text for the prompt. A layer with only some sublayers
 * on says which, so that the model doesn't claim that all of it is on.
 */
export function renderMapState(
  state: MapState,
  userCatalog: UserCatalog
): string {
  const { recordsById } = userCatalog;
  const layers = state.layers.map(({ id, visibleSubLayers }) => {
    const record = recordsById.get(id);
    const subLayers = record?.subLayers ?? [];
    const isPartial =
      record?.isGroupLayer === true &&
      visibleSubLayers.length < subLayers.length;
    return {
      id,
      caption: record?.caption,
      groupPath: record?.groupPath.join(" > "),
      ...(isPartial && { onlySubLayers: visibleSubLayers }),
    };
  });
  const background =
    state.background === null
      ? null
      : {
          id: state.background,
          caption: recordsById.get(state.background)?.caption,
        };
  // Only when there are any, so that a map without drawings reads as before
  const drawn =
    state.drawn.length > 0 || state.drawnSkipped > 0
      ? {
          drawn: state.drawn.map(describeDrawn),
          ...(state.drawnSkipped > 0 && { drawnSkipped: state.drawnSkipped }),
        }
      : {};
  return JSON.stringify({ today: state.today, layers, background, ...drawn });
}
