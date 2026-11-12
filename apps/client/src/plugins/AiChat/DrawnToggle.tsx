import { useSyncExternalStore } from "react";

import { FormControlLabel, Switch, Tooltip } from "@mui/material";

import { UI_STRINGS } from "./constants";
import { MAX_DRAWN } from "./drawnFeatures";
import type { DrawnFeatures } from "./drawnFeatures";
import type { DrawnToggleProps } from "./types";

const noDrawings = () => () => {};
const zero = () => 0;

/** Follows Sketch, so that it shows up and goes away as the user draws */
function useDrawnCount(drawings: DrawnFeatures | null): number {
  return useSyncExternalStore(
    drawings?.subscribe ?? noDrawings,
    drawings?.getCount ?? zero
  );
}

/**
 * @summary Lets the user share what they drew with Sketch with the next
 * questions. Only there while something is drawn, and off until turned on.
 */
function DrawnToggle({ model, checked }: DrawnToggleProps) {
  const count = useDrawnCount(model.drawings);
  if (count === 0) {
    return null;
  }
  return (
    <Tooltip title={UI_STRINGS.includeDrawnHint} placement="top-start">
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={checked}
            onChange={(event) => model.setIncludeDrawn(event.target.checked)}
          />
        }
        label={UI_STRINGS.includeDrawn(count, MAX_DRAWN)}
        slotProps={{ typography: { variant: "body2" } }}
        sx={{ mx: 0, px: 1.5, alignSelf: "flex-start" }}
      />
    </Tooltip>
  );
}

export default DrawnToggle;
