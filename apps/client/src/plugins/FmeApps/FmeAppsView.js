import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Grid, Button } from "@mui/material";
import InputFactory from "./InputFactory";
import FmeAppsService from "./FmeAppsServices";
import { useSnackbar } from "notistack";
import LoaderOverlay from "./components/LoaderOverlay";
import AppList from "./components/AppList";
import AppInfo from "./components/AppInfo";
import AppForm from "./components/AppForm";
import LayerController from "./LayerController";

const FmeAppsView = (props) => {
  const layerController = useMemo(() => new LayerController(), []);
  const [app, setApp] = useState("");
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [infoIsVisible, setInfoIsVisible] = useState(false);
  const [loaderText, setLoaderText] = useState("");
  const [inputFactory, setInputFactory] = useState(null);
  const fmeAppsService = useMemo(() => new FmeAppsService(props), [props]);
  const { enqueueSnackbar } = useSnackbar();

  const handleAppClick = async (app) => {
    changeApp(app);
  };

  const startLoading = (data) => {
    setLoaderText(data?.text || "Laddar");
    setIsLoading(true);
  };

  const stopLoading = () => {
    setIsLoading(false);
  };

  const changeApp = useCallback(
    (targetApp) => {
      setApp(targetApp);

      targetApp.form.forEach((formItem) => {
        // set value to default
        formItem.value = formItem.defaultValue;
      });

      const inputFactory = new InputFactory(
        targetApp,
        targetApp.form,
        setForm,
        fmeAppsService,
        {
          onProgress: (data) => {
            // progress is 0%
            // For now we just handle the progress as 0% or 100%
            startLoading(data);
          },
          onProgressEnd: () => {
            // progress is 100%
            stopLoading();
          },
        }
      );
      setInputFactory(inputFactory);
      setForm(targetApp.form);

      // setTimeout(() => {
      //   startLoading({ text: "Oops!" });
      // }, 2000);

      // setTimeout(() => {
      //   stopLoading();
      // }, 10000);
    },
    [setApp, setInputFactory, setForm, fmeAppsService]
  );

  useEffect(() => {
    // If theres only one app, set it as the starting app
    // if (props.options.applicationList.length === 1) {
    //   changeApp(props.options.applicationList[0]);
    // }
  }, [props.options.applicationList, changeApp]);

  // const styles = {
  //   Point: new Style({
  //     // image: image,
  //   }),
  //   LineString: new Style({
  //     stroke: new Stroke({
  //       color: "green",
  //       width: 1,
  //     }),
  //   }),
  //   MultiLineString: new Style({
  //     stroke: new Stroke({
  //       color: "green",
  //       width: 1,
  //     }),
  //   }),
  //   MultiPoint: new Style({
  //     // image: image,
  //   }),
  //   MultiPolygon: new Style({
  //     stroke: new Stroke({
  //       color: "yellow",
  //       width: 1,
  //     }),
  //     fill: new Fill({
  //       color: "rgba(255, 255, 0, 0.1)",
  //     }),
  //   }),
  //   Polygon: new Style({
  //     stroke: new Stroke({
  //       color: "red",
  //       lineDash: [4],
  //       width: 3,
  //     }),
  //     fill: new Fill({
  //       color: "rgba(255, 255, 0, 0.3)",
  //     }),
  //   }),
  //   GeometryCollection: new Style({
  //     stroke: new Stroke({
  //       color: "magenta",
  //       width: 2,
  //     }),
  //     fill: new Fill({
  //       color: "magenta",
  //     }),
  //     image: new CircleStyle({
  //       radius: 10,
  //       fill: null,
  //       stroke: new Stroke({
  //         color: "magenta",
  //       }),
  //     }),
  //   }),
  //   Circle: new Style({
  //     stroke: new Stroke({
  //       color: "red",
  //       width: 2,
  //     }),
  //     fill: new Fill({
  //       color: "rgba(255,0,0,0.2)",
  //     }),
  //   }),
  // };

  // const styleFunction = function (feature) {
  //   return styles[feature.getGeometry().getType()];
  // };

  const handleFMEError = (results) => {
    stopLoading();
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
    // TODO: Add form validation!!

    startLoading({ text: "Kör. V.g. vänta." });

    // Retrieve the results of the app execution from the FmeFlow API
    const results = await fmeAppsService.getDataStreamingServiceResults(
      app,
      form
    );

    if (results.error) {
      handleFMEError(results);
      return;
    }

    layerController.applyResultDataToMap(results);

    stopLoading();
  };

  /**
   * Renders a form based on the app's form property.
   * It renders a Grid container with a FormControl component for each form item.
   * @returns {JSX.Element} The rendered form.
   */

  // Render the view
  return (
    // Make wrapper div relative so the LoaderOverlay is positioned correctly.
    <div style={{ position: "relative" }}>
      <AppList
        app={app}
        onReset={() => {
          setInfoIsVisible(false);
          setApp(null);
        }}
        onSelectApp={handleAppClick}
        onInfo={() => {
          setInfoIsVisible(!infoIsVisible);
        }}
        list={props.options.applicationList}
      />

      <Grid
        container
        spacing={1}
        sx={{
          mt: 0.5,
          overflowX: "hidden",
          filter: `grayscale(${isLoading ? 1 : 0}) blur(${isLoading ? "1px" : 0})`,
          opacity: isLoading ? 0.3 : 1,
          transition: "all 500ms",
        }}
      >
        <AppInfo app={app} infoIsVisible={infoIsVisible} />
        <AppForm app={app} form={form} inputFactory={inputFactory} />

        {app && (
          <Grid
            item
            xs={12}
            sx={{ justifyContent: "flex-end", display: "flex" }}
          >
            <Button variant="contained" onClick={handleExecution}>
              Kör
            </Button>
          </Grid>
        )}
      </Grid>
      <LoaderOverlay isLoading={isLoading} text={loaderText} />
    </div>
  );
};

export default FmeAppsView;
