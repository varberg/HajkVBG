import { Box, List, Typography } from "@mui/material";

import { UI_STRINGS } from "./constants";
import { amount, duration, joined, tripsPerHour } from "./routeFormat";
import { Place, Row, Variant } from "./RouteRows";
import type { RouteStreet, RouteSummary, TransitStep } from "./types";

/** A walk, a wait at a stop or a ride, by what the step has */
function stepRow(step: TransitStep): { name: string; detail: string } {
  if (step.ride_min !== undefined) {
    const towards = step.towards
      ? ` ${UI_STRINGS.towards} ${step.towards}`
      : "";
    const stops = step.from && step.to ? `: ${step.from} → ${step.to}` : "";
    return {
      name: `${UI_STRINGS.line} ${step.line ?? ""}${towards}${stops}`,
      detail: joined(
        duration(step.ride_min),
        tripsPerHour(step.trips_per_hour)
      ),
    };
  }
  if (step.wait_min !== undefined) {
    return {
      name: UI_STRINGS.waitAt(step.line, step.at),
      detail: duration(step.wait_min) ?? "",
    };
  }
  const via = step.via?.length ? ` via ${step.via.join(", ")}` : "";
  return {
    name: `${UI_STRINGS.walk}${via}`,
    detail: joined(duration(step.walk_min), amount(step.km, UI_STRINGS.km)),
  };
}

/** Keyed by when each step starts, as a step can be like another */
function stepRows(steps: TransitStep[]) {
  let start = 0;
  return steps.map((step) => {
    const key = `${start}`;
    start += step.walk_min ?? step.wait_min ?? step.ride_min ?? 0;
    return { key, ...stepRow(step) };
  });
}

/** The streets along a route, merged so that a name can come back later */
function streetRows(summary: RouteSummary) {
  return (summary.streets ?? []).reduce<
    Array<RouteStreet & { key: string; end: number }>
  >((list, street) => {
    const start = list.at(-1)?.end ?? 0;
    const key = `${street.name}@${start}`;
    return [...list, { ...street, key, end: start + street.km }];
  }, []);
}

/**
 * The nearest stops of places, the stops of a line, the steps of a transit route, the legs of one with
 * several stops, or else the streets of a route
 */
function RouteDetails({ summary }: { summary: RouteSummary }) {
  if (summary.variants?.length) {
    return (
      <Box aria-label={UI_STRINGS.stops}>
        {summary.variants.map((variant) => (
          <Variant key={variant.direction_id} variant={variant} />
        ))}
      </Box>
    );
  }
  if (summary.results?.length) {
    return (
      <Box aria-label={UI_STRINGS.stops}>
        {summary.results.map((place, i) => (
          // Two places can have the same name, and the order never changes
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <Place key={`${place.point}@${i}`} place={place} />
        ))}
      </Box>
    );
  }
  if (summary.steps?.length) {
    return (
      <List dense disablePadding aria-label={UI_STRINGS.steps}>
        {stepRows(summary.steps).map(({ key, ...row }) => (
          <Row key={key} {...row} />
        ))}
      </List>
    );
  }
  if (summary.legs !== undefined) {
    return (
      <List dense disablePadding>
        {summary.legs.map((leg) => (
          <Row
            key={leg.leg}
            name={`${leg.from} → ${leg.to}`}
            detail={joined(
              leg.lines?.length
                ? `${UI_STRINGS.line} ${leg.lines.join(", ")}`
                : null,
              duration(leg.minutes),
              amount(leg.km, UI_STRINGS.km)
            )}
          />
        ))}
      </List>
    );
  }
  return (
    <List dense disablePadding aria-label={UI_STRINGS.streets}>
      {streetRows(summary).map((street) => (
        <Row
          key={street.key}
          name={street.name}
          detail={joined(
            duration(street.minutes),
            amount(street.km, UI_STRINGS.km)
          )}
        />
      ))}
      {summary.streets_truncated !== undefined && (
        <Typography variant="caption" color="text.secondary">
          {UI_STRINGS.moreStreets(summary.streets_truncated)}
        </Typography>
      )}
    </List>
  );
}

export default RouteDetails;
