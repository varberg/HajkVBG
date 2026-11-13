import { FormControlLabel, Switch, Tooltip } from "@mui/material";

import { UI_STRINGS } from "./constants";
import { MAX_DRAWN } from "./drawnFeatures";
import type { DrawnToggleProps } from "./types";

/**
 * @summary Lets the user share what they drew with Sketch with the next
 * questions. Only there while something is drawn, and off until turned on.
 */
function DrawnToggle({ model, checked, count }: DrawnToggleProps) {
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
        sx={{ mx: 0, minWidth: 0 }}
      />
    </Tooltip>
  );
}

export default DrawnToggle;
