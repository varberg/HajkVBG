import React from "react";
import {
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Tooltip,
  Typography,
  Accordion,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { StyledAccordionSummary } from "../components/StyledAccordionSummary";
import { StyledAccordionDetails } from "../components/StyledAccordionDetails";

import {
  AREA_MEASUREMENT_UNITS,
  LENGTH_MEASUREMENT_UNITS,
  MEASUREMENT_PRECISIONS,
} from "../constants";

const MeasurementSettings = ({ settings, setSettings }) => {
  return (
    <Accordion size="small">
      <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>Mätinställningar</Typography>
      </StyledAccordionSummary>
      <StyledAccordionDetails style={{ maxWidth: "100%" }}>
        <Grid container>
          <Grid item xs={12}>
            <Tooltip
              disableInteractive
              title={
                !settings.showText
                  ? "Aktivera text på objekten om du vill visa objektens omkrets/radie."
                  : `Slå ${settings.showArea ? "av" : "på"} om du vill ${
                      settings.showArea ? "dölja" : "visa"
                    } area på objekten.`
              }
            >
              <FormControlLabel
                label="Visa area"
                control={
                  <Switch
                    disabled={!settings.showText}
                    checked={settings.showArea}
                    onChange={() => {
                      setSettings((settings) => ({
                        ...settings,
                        showArea: !settings.showArea,
                      }));
                    }}
                    color="primary"
                  />
                }
              />
            </Tooltip>
          </Grid>
          <Grid item xs={12}>
            <Tooltip
              disableInteractive
              title={
                !settings.showText
                  ? "Aktivera text på objekten om du vill visa objektens längd"
                  : `Slå ${settings.showLength ? "av" : "på"} om du vill ${
                      settings.showLength ? "dölja" : "visa"
                    } längd på objekten.`
              }
            >
              <FormControlLabel
                label="Visa längd"
                control={
                  <Switch
                    disabled={!settings.showText}
                    checked={settings.showLength ?? false}
                    onChange={() => {
                      setSettings((settings) => ({
                        ...settings,
                        showLength: !settings.showLength,
                      }));
                    }}
                    color="primary"
                  />
                }
              />
            </Tooltip>
          </Grid>
          <Grid item xs={12}>
            <Tooltip
              disableInteractive
              title={
                !settings.showText
                  ? "Aktivera text på objekten om du vill visa objektens omkrets/radie."
                  : `Slå ${settings.showPerimeter ? "av" : "på"} om du vill ${
                      settings.showPerimeter ? "dölja" : "visa"
                    } omkrets/radie. på objekten.`
              }
            >
              <FormControlLabel
                label="Visa omkrets/radie"
                control={
                  <Switch
                    disabled={!settings.showText}
                    checked={settings.showPerimeter}
                    onChange={() => {
                      setSettings((settings) => ({
                        ...settings,
                        showPerimeter: !settings.showPerimeter,
                      }));
                    }}
                    color="primary"
                  />
                }
              />
            </Tooltip>
          </Grid>
          <Grid item xs={12}>
            <Tooltip title="Välj enhet för mätning av areal.">
              <FormControl size="small" style={{ marginTop: 8 }}>
                <InputLabel
                  variant="outlined"
                  id="sketch-select-area-measurement-unit-label"
                >
                  Mätenhet, areal
                </InputLabel>
                <Select
                  id="sketch-select-area-measurement-unit"
                  labelId="sketch-select-area-measurement-unit-label"
                  value={settings.areaUnit}
                  label="Mätenhet, areal"
                  variant="outlined"
                  onChange={(e) => {
                    setSettings((settings) => ({
                      ...settings,
                      areaUnit: e.target.value,
                    }));
                  }}
                >
                  {AREA_MEASUREMENT_UNITS.map((unit, index) => {
                    return (
                      <MenuItem value={unit.type} key={index}>
                        {unit.name}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Tooltip>
          </Grid>
          <Grid item xs={12}>
            <Tooltip title="Välj enhet för mätning av längd.">
              <FormControl size="small" fullWidth style={{ marginTop: 16 }}>
                <InputLabel
                  variant="outlined"
                  id="sketch-select-length-measurement-unit-label"
                >
                  Mätenhet, längd
                </InputLabel>
                <Select
                  id="sketch-select-length-measurement-unit"
                  labelId="sketch-select-length-measurement-unit-label"
                  value={settings.lengthUnit}
                  label="Mätenhet, längd"
                  variant="outlined"
                  onChange={(e) => {
                    setSettings((settings) => ({
                      ...settings,
                      lengthUnit: e.target.value,
                    }));
                  }}
                >
                  {LENGTH_MEASUREMENT_UNITS.map((unit, index) => {
                    return (
                      <MenuItem value={unit.type} key={index}>
                        {unit.name}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Tooltip>
          </Grid>
          <Grid item xs={12}>
            <Tooltip title="Välj med vilken precision mätvärdena ska presenteras.">
              <FormControl size="small" fullWidth style={{ marginTop: 16 }}>
                <InputLabel
                  variant="outlined"
                  id="sketch-select-precision-label"
                >
                  Mätprecision
                </InputLabel>
                <Select
                  id="sketch-select-precision"
                  labelId="sketch-select-precision-label"
                  value={settings.precision ?? 0}
                  label="Mätprecision"
                  variant="outlined"
                  onChange={(e) => {
                    setSettings((settings) => ({
                      ...settings,
                      precision: parseInt(e.target.value),
                    }));
                  }}
                >
                  {MEASUREMENT_PRECISIONS.map((precision, index) => {
                    return (
                      <MenuItem value={precision.value} key={index}>
                        {precision.name}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Tooltip>
          </Grid>
        </Grid>
      </StyledAccordionDetails>
    </Accordion>
  );
};

export default MeasurementSettings;
