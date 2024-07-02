import { EditLocation } from "@mui/icons-material";
import { Grid, Button, Paper, Box } from "@mui/material";
import HajkToolTip from "components/HajkToolTip";
import AppModel from "models/AppModel";
import { useSnackbar } from "notistack";
import React, { useEffect, useRef, useState } from "react";

const InputCoordinatePicker = (props) => {
  const d = props.formItem;
  const onChange = props.onChange;
  const [pickerActive, setPickerActive] = useState(false);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  let snackbarKey = 0;

  const handleMapClick = (e) => {
    if (e?.coordinate) {
      d.value = e.coordinate;
      if (onChange) {
        onChange(
          e,
          `${e.coordinate[1].toFixed(0)},${e.coordinate[0].toFixed(0)}`
        );
      }
    }
    deactivatePickerClick();
  };

  const deactivatePickerClick = () => {
    console.log("deactivatePickerClick");
    setPickerActive(false);
    window.removeEventListener("keydown", handleKeyDown);
    AppModel.map.un("singleclick", handleMapClick);
    closeSnackbar(snackbarKey);
  };
  const activatePickerClick = (e) => {
    setPickerActive(true);
    window.addEventListener("keydown", handleKeyDown);
    AppModel.map.on("singleclick", handleMapClick);

    snackbarKey = enqueueSnackbar(
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
  };

  const handleKeyDown = (e) => {
    if (e.keyCode === 27 /*Escape*/) {
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

  const renderTextField = () => {
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
        <Box sx={{ opacity: pickerActive ? 0.5 : 0.8 }}>{d.value}</Box>
      </Paper>
    );
  };

  return (
    <Grid container spacing={1} sx={{ mb: 1 }}>
      <Grid item xs={2}>
        <HajkToolTip title={d.tooltip}>
          <Button
            variant="outlined"
            disabled={d.disabled || pickerActive}
            onClick={activatePickerClick}
            sx={{ height: "100%" }}
          >
            <EditLocation />
          </Button>
        </HajkToolTip>
      </Grid>
      <Grid item xs={10}>
        {renderTextField()}
      </Grid>
    </Grid>
  );
};

export default InputCoordinatePicker;
