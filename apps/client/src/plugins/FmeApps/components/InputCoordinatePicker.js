import { EditLocation } from "@mui/icons-material";
import { Grid, Button, Paper, Box } from "@mui/material";
import HajkToolTip from "components/HajkToolTip";
import AppModel from "models/AppModel";
import { useSnackbar } from "notistack";
import React, { useEffect, useRef, useState } from "react";

const InputCoordinatePicker = (props) => {
  const { formItem, onChange, localObserver } = props;
  const [pickerActive, setPickerActive] = useState(false);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const snackbarKey = useRef(1);

  const handleMapClick = (e) => {
    if (e?.coordinate) {
      formItem.value = e.coordinate;
      if (onChange) {
        // Forward the change
        onChange(
          e,
          `${e.coordinate[1].toFixed(3)},${e.coordinate[0].toFixed(3)}`
        );
        localObserver.publish("fmeapps.layercontroller.addpoint", {
          coordinate: e.coordinate,
        });
      }
    }

    deactivatePickerClick();
  };

  const deactivatePickerClick = () => {
    closeSnackbar(snackbarKey.current);
    window.removeEventListener("keydown", handleKeyDown);
    AppModel.map.un("singleclick", handleMapClick);
    setPickerActive(false);
  };

  const activatePickerClick = (e) => {
    window.addEventListener("keydown", handleKeyDown);
    AppModel.map.on("singleclick", handleMapClick);
    closeSnackbar(snackbarKey.current);

    const key = enqueueSnackbar(
      "Klicka i kartan för att välja position. [Escape] för att avbryta.",
      {
        variant: "info",
        persist: true,
        anchorOrigin: {
          vertical: "top",
          horizontal: "center",
        },
      }
    );

    snackbarKey.current = key;
    setPickerActive(true);
  };

  const handleKeyDown = (e) => {
    if (e.keyCode === 27 /*Escape char*/) {
      deactivatePickerClick();
    }
  };

  const componentWillUnmount = useRef(false);

  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (componentWillUnmount.current) {
        deactivatePickerClick();
      }
    };
    // Linter is very picky about this, but it's safe and working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localObserver.unsubscribe("fmeapps.windowhide");
    localObserver.subscribe("fmeapps.windowhide", () => {
      deactivatePickerClick();
    });
  });

  const renderLabel = () => {
    return (
      <Paper
        variant="outlined"
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          pl: 1,
          ml: 0.5,
        }}
      >
        <Box sx={{ opacity: pickerActive ? 0.5 : 0.8 }}>{formItem.value}</Box>
      </Paper>
    );
  };

  return (
    <Grid container spacing={1} sx={{ mb: 1 }}>
      <Grid item xs={2}>
        <HajkToolTip title={formItem.tooltip}>
          <Button
            variant="outlined"
            disabled={formItem.disabled || pickerActive}
            onClick={activatePickerClick}
            sx={{ height: "100%" }}
          >
            <EditLocation />
          </Button>
        </HajkToolTip>
      </Grid>
      <Grid item xs={10}>
        {renderLabel()}
      </Grid>
    </Grid>
  );
};

export default InputCoordinatePicker;
