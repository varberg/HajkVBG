import React from "react";
import {
  FormControl,
  FormLabel,
  FormControlLabel,
  Grid,
  Switch,
  Tooltip,
} from "@mui/material";

import Information from "../components/Information";
import MeasurementSettings from "../components/MeasurementSettings";

import LocalStorageHelper from "utils/LocalStorageHelper";
import useCookieStatus from "hooks/useCookieStatus";
import { STORAGE_KEY } from "../constants";

const SettingsView = (props) => {
  // Let's destruct some props
  const { id, model, measurementSettings, setMeasurementSettings } = props;
  // We're gonna need to keep track of if we're allowed to save stuff in LS. Let's use the hook.
  const { functionalCookiesOk } = useCookieStatus(props.globalObserver);
  // We're gonna need some local state as well. For example, should we show helper-snacks?
  const [showHelperSnacks, setShowHelperSnacks] = React.useState(
    model.getShowHelperSnacks()
  );
  // We have to get some information about the current activity (view)
  const activity = model.getActivityFromId(id);
  // An effect that makes sure to update the model with the user-choice regarding the helper-snacks.
  // The effect also makes sure to store the setting in the LS (if allowed).
  React.useEffect(() => {
    model.setShowHelperSnacks(showHelperSnacks);
    if (functionalCookiesOk) {
      LocalStorageHelper.set(STORAGE_KEY, {
        ...LocalStorageHelper.get(STORAGE_KEY),
        showHelperSnacks: showHelperSnacks,
      });
    }
  }, [model, showHelperSnacks, functionalCookiesOk]);

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Information text={activity.information} />
      </Grid>
      <Grid container item xs={12}>
        <Grid item xs={12}>
          <FormControl component="fieldset">
            <FormLabel focused={false} component="legend">
              Generella inställningar
            </FormLabel>
            <Tooltip
              disableInteractive
              title={`Slå ${
                measurementSettings.showText ? "av" : "på"
              } om du vill ${
                measurementSettings.showText ? "dölja" : "visa"
              } text på objekten.`}
            >
              <FormControlLabel
                label="Visa text på objekten"
                control={
                  <Switch
                    checked={measurementSettings.showText}
                    onChange={() => {
                      setMeasurementSettings((settings) => ({
                        ...settings,
                        showText: !settings.showText,
                      }));
                    }}
                    color="primary"
                  />
                }
              />
            </Tooltip>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Tooltip
            disableInteractive
            title={`Slå ${showHelperSnacks ? "av" : "på"} om du vill ${
              showHelperSnacks ? "dölja" : "visa"
            } hjälptexter.`}
          >
            <FormControlLabel
              label="Visa hjälptexter"
              control={
                <Switch
                  checked={showHelperSnacks}
                  onChange={() => setShowHelperSnacks((show) => !show)}
                  color="primary"
                />
              }
            />
          </Tooltip>
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <MeasurementSettings
          settings={measurementSettings}
          setSettings={setMeasurementSettings}
        />
      </Grid>
    </Grid>
  );
};

export default SettingsView;
