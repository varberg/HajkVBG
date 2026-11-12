import { Box, List, ListItem, Typography } from "@mui/material";

import { UI_STRINGS } from "./constants";
import {
  departuresPerHour,
  duration,
  joined,
  tripsPerHour,
  walkDistance,
} from "./routeFormat";
import type { LineVariant, PlaceStops } from "./types";

/** A name, with its time or distance to the right */
export function Row({ name, detail }: { name: string; detail: string }) {
  return (
    <ListItem disableGutters sx={{ justifyContent: "space-between", gap: 1 }}>
      <Typography variant="body2">{name}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {detail}
      </Typography>
    </ListItem>
  );
}

/** One direction of a line, with its stops */
export function Variant({ variant }: { variant: LineVariant }) {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
        {`${UI_STRINGS.towards} ${variant.towards ?? variant.to}`}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {joined(
          duration(variant.run_minutes),
          tripsPerHour(variant.trips_per_hour)
        )}
      </Typography>
      <List dense disablePadding>
        {variant.stops.map((stop, i) => (
          <Row
            // A loop line has its first stop last too, but at another time
            key={`${stop.stop}@${stop.minutes}`}
            name={stop.stop}
            detail={i === 0 ? "" : (duration(stop.minutes) ?? "")}
          />
        ))}
      </List>
    </Box>
  );
}

/** A place and its nearest stops */
export function Place({ place }: { place: PlaceStops }) {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
        {place.point}
      </Typography>
      <List dense disablePadding>
        {place.stops.map((stop) => (
          <Row
            key={stop.stop}
            name={joined(
              stop.stop,
              stop.lines?.length
                ? `${UI_STRINGS.line} ${stop.lines.join(", ")}`
                : null
            )}
            detail={joined(
              duration(stop.walk_min),
              walkDistance(stop.walk_m),
              departuresPerHour(stop.departures_per_hour)
            )}
          />
        ))}
      </List>
    </Box>
  );
}
