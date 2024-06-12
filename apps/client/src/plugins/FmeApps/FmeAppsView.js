import React, { useEffect, useState } from "react";

import {
  FormControl,
  MenuItem,
  Select,
  InputLabel,
  Grid,
  Button,
} from "@mui/material";
import AppModel from "models/AppModel";
import GeoJSON from "ol/format/GeoJSON.js";
import { Fill, Stroke, Style } from "ol/style";
import CircleStyle from "ol/style/Circle";
import InputFactory from "./InputFactory";
import FmeAppsService from "./FmeAppsServices";
import { useSnackbar } from "notistack";
import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";

const FmeAppsView = (props) => {
  const [app, setApp] = useState("");
  const [form, setForm] = useState(null);
  const [inputFactory, setInputFactory] = useState(null);
  const [vectorSource, setVectorSource] = useState(null);
  const [vectorLayer, setVectorLayer] = useState(null);
  const fmeAppsService = new FmeAppsService(props);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    // If theres only one app, set it as the starting app
    if (props.options.applicationList.length === 1) {
      changeApp(props.options.applicationList[0]);
    }
  }, [props.options.applicationList]);

  const handleAppChanged = async (event) => {
    changeApp(event.target.value);
  };

  const changeApp = (targetApp) => {
    setApp(targetApp);

    console.log(targetApp);

    targetApp.form.forEach((formItem) => {
      // set value to default
      formItem.value = formItem.defaultValue;
    });

    const inputFactory = new InputFactory(targetApp.form, setForm);
    setInputFactory(inputFactory);
    setForm(targetApp.form);
  };

  const styles = {
    Point: new Style({
      // image: image,
    }),
    LineString: new Style({
      stroke: new Stroke({
        color: "green",
        width: 1,
      }),
    }),
    MultiLineString: new Style({
      stroke: new Stroke({
        color: "green",
        width: 1,
      }),
    }),
    MultiPoint: new Style({
      // image: image,
    }),
    MultiPolygon: new Style({
      stroke: new Stroke({
        color: "yellow",
        width: 1,
      }),
      fill: new Fill({
        color: "rgba(255, 255, 0, 0.1)",
      }),
    }),
    Polygon: new Style({
      stroke: new Stroke({
        color: "red",
        lineDash: [4],
        width: 3,
      }),
      fill: new Fill({
        color: "rgba(255, 255, 0, 0.3)",
      }),
    }),
    GeometryCollection: new Style({
      stroke: new Stroke({
        color: "magenta",
        width: 2,
      }),
      fill: new Fill({
        color: "magenta",
      }),
      image: new CircleStyle({
        radius: 10,
        fill: null,
        stroke: new Stroke({
          color: "magenta",
        }),
      }),
    }),
    Circle: new Style({
      stroke: new Stroke({
        color: "red",
        width: 2,
      }),
      fill: new Fill({
        color: "rgba(255,0,0,0.2)",
      }),
    }),
  };

  /**
   * Returns the vector source.
   * If the vector source is not initialized, it creates a new vector source and sets it.
   * @returns {VectorSource} The vector source.
   */
  const getVectorSource = () => {
    let currentVectorSource = vectorSource;
    if (!currentVectorSource) {
      currentVectorSource = new VectorSource({ wrapX: false });
      setVectorSource(currentVectorSource);
    }
    return currentVectorSource;
  };

  /**
   * Returns the vector layer.
   * If the vector layer is not initialized, it creates a new vector layer and sets it.
   * @returns {VectorLayer} The vector layer.
   */
  const getVectorLayer = (source) => {
    let currentVectorLayer = vectorLayer;
    if (!currentVectorLayer) {
      currentVectorLayer = new VectorLayer({
        source: source,
        style: styleFunction,
      });
      setVectorLayer(currentVectorLayer);
      AppModel.map.addLayer(currentVectorLayer);
    }
    return currentVectorLayer;
  };

  const styleFunction = function (feature) {
    return styles[feature.getGeometry().getType()];
  };

  const handleError = (results) => {
    console.error(results.code, results.message);
    enqueueSnackbar(
      `Appen '${app.title}' fick felsvar från FME Flow.\nFelmeddelande: ${results.message}\nFelkod: ${results.code}`,
      {
        anchorOrigin: {
          vertical: "top",
          horizontal: "center",
        },
        variant: "error",
        style: { whiteSpace: "pre-line" },
      }
    );
  };

  /**
   * Handles the execution of the app.
   * Retrieves the results of the app execution from the FmeFlow API.
   * Clears the vector source and adds the retrieved features to it.
   * Fits the map view to the extent of the vector layer.
   */
  const handleExecution = async () => {
    // Retrieve the results of the app execution from the FmeFlow API
    const results = await fmeAppsService.getDataStreamingServiceResults(
      app,
      form
    );

    if (results.error) {
      handleError(results);
      return;
    }

    // We assume that the results are GeoJSON, this is required.
    // Convert projection if necessary
    const features = new GeoJSON().readFeatures(results, {
      featureProjection: AppModel.map.getView().getProjection(),
    });

    const currentVectorSource = getVectorSource();

    // Clear the vector source
    currentVectorSource.clear();

    // Add the retrieved features to the vector source
    // TIP: If you get an error here when running addFeatures, about something "function getExtent() does not exist".
    // Its probably malformed GeoJson. Check your incoming data.
    currentVectorSource.addFeatures(features);

    // Fit the map view to the extent of the vector layer
    const currentVectorLayer = getVectorLayer(currentVectorSource);
    AppModel.map.getView().fit(currentVectorLayer.getSource().getExtent(), {
      size: AppModel.map.getSize(),
      padding: [50, 50, 50, 50],
      duration: 500,
    });
  };

  /**
   * Filters the form array based on certain conditions.
   * @param {Object} formItem - The form item to filter.
   * @returns {boolean}
   */
  const formFilter = (formItem) => {
    // If the formItem is hidden, return false.
    if (formItem.hidden === true) {
      return false;
    }

    // visibleIf is used to show/hide the form item based on another form item's value.
    if (formItem.visibleIf?.id && formItem.visibleIf?.value) {
      const owner = form.find((item) => item.id === formItem.visibleIf.id);
      return owner && owner.value === formItem.visibleIf.value;
    }

    return true;
  };

  /**
   * Renders a form based on the app's form property.
   * It renders a Grid container with a FormControl component for each form item.
   * @returns {JSX.Element} The rendered form.
   */
  const renderForm = () => {
    if (!app?.form) {
      return <div></div>;
    }

    return (
      <Grid container spacing={1}>
        {form.filter(formFilter).map((formItem, index) => {
          return (
            <Grid
              item
              xs={12}
              md={formItem.gridSize ?? 12}
              key={formItem.id + index}
            >
              <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                {inputFactory.getInputItem(formItem)}
              </FormControl>
            </Grid>
          );
        })}
      </Grid>
    );
  };

  // Render the view
  return (
    <Grid container spacing={1} sx={{ mt: 1 }}>
      <Grid item xs={12}>
        <FormControl fullWidth size="small">
          <InputLabel id="fme-app-label">Tillgängliga appar</InputLabel>
          <Select
            labelId="fme-app-label"
            id="fme-app-id"
            label="Tillgängliga appar"
            value={app}
            onChange={handleAppChanged}
          >
            {props.options.applicationList.map((app, index) => (
              <MenuItem key={app.id + index} value={app}>
                {app.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        {renderForm()}
      </Grid>
      {form && (
        <Grid item xs={12} sx={{ justifyContent: "flex-end", display: "flex" }}>
          <Button variant="contained" onClick={handleExecution}>
            Kör
          </Button>
        </Grid>
      )}
    </Grid>
  );
};

export default FmeAppsView;
