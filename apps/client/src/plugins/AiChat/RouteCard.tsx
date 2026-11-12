import { useState, useSyncExternalStore } from "react";

import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Paper,
  Typography,
} from "@mui/material";

import { MODE_NAMES, UI_STRINGS } from "./constants";
import RouteDetails from "./RouteDetails";
import {
  amount,
  detailsLabel,
  duration,
  joined,
  tripsPerHour,
} from "./routeFormat";
import type { RouteLayer } from "./routeLayer";
import type { RouteCardProps, RouteSummary } from "./types";

const modeName = (mode: string | undefined) =>
  mode === undefined ? undefined : (MODE_NAMES[mode] ?? mode);

/** A line: its number and the two ends of its main variant */
function lineTexts(summary: RouteSummary) {
  const main = summary.variants?.[0];
  return {
    title: joined(
      `${UI_STRINGS.line} ${summary.line ?? ""}`.trim(),
      modeName(summary.mode)
    ),
    places: summary.name || (main ? `${main.from} – ${main.to}` : null),
    totals: joined(
      duration(main?.run_minutes),
      tripsPerHour(main?.trips_per_hour)
    ),
  };
}

/** The nearest stops of places: how many there are */
const stopsTexts = (summary: RouteSummary) => ({
  title: UI_STRINGS.nearestStops,
  places: UI_STRINGS.places(summary.results?.length ?? 0),
  totals: "",
});

function routeTexts(summary: RouteSummary) {
  const reach = summary.tool === "reachable_within";
  const title = joined(
    reach ? UI_STRINGS.reach : UI_STRINGS.route,
    modeName(summary.mode)
  );
  // The destination in bold, as it's what the user asked about
  const places = reach ? (
    summary.from
  ) : summary.from && summary.to ? (
    <>
      {summary.from} → <Box component="strong">{summary.to}</Box>
    </>
  ) : null;
  const totals = reach
    ? joined(
        duration(summary.minutes),
        amount(summary.road_km, UI_STRINGS.roadKm)
      )
    : joined(
        duration(summary.minutes ?? summary.total_minutes),
        amount(summary.km ?? summary.total_km, UI_STRINGS.km)
      );
  return { title, places, totals };
}

/** Where the time of a transit route goes */
const transitSplit = (summary: RouteSummary) =>
  joined(
    summary.walk_min !== undefined
      ? `${duration(summary.walk_min)} ${UI_STRINGS.walkTime}`
      : null,
    summary.wait_min !== undefined
      ? `${duration(summary.wait_min)} ${UI_STRINGS.waitTime}`
      : null,
    summary.ride_min !== undefined
      ? `${duration(summary.ride_min)} ${UI_STRINGS.rideTime}`
      : null,
    summary.changes !== undefined ? UI_STRINGS.changes(summary.changes) : null
  );

/**
 * What a route avoided, and how much longer that made it. An area that didn't
 * apply, such as one closed for cars on a bike route, isn't counted.
 */
function avoidedText(summary: RouteSummary): string {
  const applied = (summary.avoided ?? []).filter((a) => a.applied !== false);
  if (applied.length === 0) {
    return "";
  }
  const minutes = summary.minutes ?? summary.total_minutes;
  const without = summary.minutes_without_avoid;
  const extra =
    typeof minutes === "number" && typeof without === "number"
      ? minutes - without
      : null;
  return joined(
    UI_STRINGS.avoided(applied.length),
    extra === null
      ? null
      : Math.round(extra * 60) <= 0
        ? UI_STRINGS.noDetour
        : UI_STRINGS.detour(duration(extra)!)
  );
}

function Header({ summary }: { summary: RouteSummary }) {
  const line = summary.tool === "line_info";
  const { title, places, totals } = line
    ? lineTexts(summary)
    : summary.tool === "nearest_stops"
      ? stopsTexts(summary)
      : routeTexts(summary);
  const split = line ? "" : transitSplit(summary);
  const avoided = avoidedText(summary);
  return (
    <Box>
      <Typography variant="subtitle2">{title}</Typography>
      {places && <Typography variant="body2">{places}</Typography>}
      {totals !== "" && (
        <Typography variant="body2" color="text.secondary">
          {totals}
        </Typography>
      )}
      {split !== "" && (
        <Typography variant="body2" color="text.secondary">
          {split}
        </Typography>
      )}
      {avoided !== "" && (
        <Typography variant="body2" color="text.secondary">
          {avoided}
        </Typography>
      )}
      {(line || summary.mode === "transit") && (
        <Typography variant="caption" color="text.secondary">
          {UI_STRINGS.transitNote}
        </Typography>
      )}
    </Box>
  );
}

/** Follows the map, so that it's right also when the routes change elsewhere */
function useRouteVisible(
  routeLayer: RouteLayer,
  shownId: number | null,
  index: number
): boolean | null {
  return useSyncExternalStore(routeLayer.subscribe, () =>
    shownId === null ? null : routeLayer.isVisible(shownId, index)
  );
}

/**
 * @summary The whole result of a route, reachable area or line under the answer, so that the model
 * doesn't have to repeat it. The model only gets the main roads.
 */
function RouteCard({
  summary,
  color,
  routeLayer,
  shownId,
  index,
}: RouteCardProps) {
  const [open, setOpen] = useState(false);
  // Null once the routes are replaced or cleared, and then there's nothing to toggle
  const visible = useRouteVisible(routeLayer, shownId, index);
  const label = detailsLabel(summary);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderLeft: 4, borderLeftColor: color }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
        {visible !== null && shownId !== null && (
          <Checkbox
            size="small"
            checked={visible}
            onChange={(event) =>
              routeLayer.setVisible(shownId, index, event.target.checked)
            }
            slotProps={{ input: { "aria-label": UI_STRINGS.showRoute } }}
            sx={{ p: 0.25, color, "&.Mui-checked": { color } }}
          />
        )}
        <Header summary={summary} />
      </Box>
      {label !== null && (
        <>
          <Button
            size="small"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            sx={{ mt: 0.5, px: 0 }}
          >
            {label}
          </Button>
          <Collapse in={open}>
            <RouteDetails summary={summary} />
          </Collapse>
        </>
      )}
    </Paper>
  );
}

export default RouteCard;
