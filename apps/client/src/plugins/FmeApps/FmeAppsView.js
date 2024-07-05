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
import { ArrowForward, LayersClear } from "@mui/icons-material";

const FmeAppsView = (props) => {
  const { localObserver, options } = props;

  const layerController = useMemo(
    () => new LayerController(localObserver),
    [localObserver]
  );

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
      layerController.app = targetApp;

      targetApp.form.forEach((formItem) => {
        // set value to default
        formItem.value = formItem.defaultValue;
      });

      const inputFactory = new InputFactory(
        targetApp,
        targetApp.form,
        localObserver,
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

      //Keeping this here for testing loader
      // (() => {
      //   setTimeout(() => {
      //     startLoading({ text: "Testing loader!" });
      //   }, 3000);

      //   setTimeout(() => {
      //     stopLoading();
      //   }, 7000);
      // })();
    },
    [
      setApp,
      setInputFactory,
      setForm,
      fmeAppsService,
      layerController,
      localObserver,
    ]
  );

  const refreshForm = useCallback((formData) => {
    // Form data has changed, force re-render.
    setForm([...formData]);
  }, []);

  useEffect(() => {
    // If there is only one app, set it as the starting app
    if (options.applicationList.length === 1) {
      changeApp(options.applicationList[0]);
    }
    localObserver.subscribe("FMEApps:refreshForm", refreshForm);
  }, [options.applicationList, changeApp, localObserver, refreshForm]);

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

  const handleResponseError = (results) => {
    stopLoading();

    let snackbarMessage = "";

    if (results.errorHandledByFME || results.errorHandledByHajk) {
      // FME returned a handled error in json format which is nice.
      // Or!! Hajk handled it in a similar way.
      snackbarMessage = results.message;
    } else {
      // FME returned an unhandled error. Lets handle it.
      snackbarMessage = `Appen '${app.title}' fick felsvar från FME.\nFelmeddelande: ${results.message}\nFelkod: ${results.code}`;
    }

    enqueueSnackbar(snackbarMessage, {
      anchorOrigin: {
        vertical: "top",
        horizontal: "center",
      },
      variant: "error",
      style: { whiteSpace: "pre-line" },
    });
  };

  const validateItem = (item) => {
    let validValue = item.value;
    if (validValue && typeof item.value === "string") {
      validValue = item.value.trim().length > 0;
    }

    if (!item.optional && !validValue) {
      if (item.visibleIf?.id && item.visibleIf?.value) {
        const owner = form.find(
          (formItem) => formItem.id === item.visibleIf.id
        );
        if (!owner) {
          console.warn(
            `Form item '${item.id}' has an invalid visibleIf value. Could not find owner.`
          );
        }
        if (owner && owner.value === item.visibleIf.value) {
          return false;
        } else {
          return true;
        }
      }
      return false;
    }
    return true;
  };

  const validateForm = () => {
    // A simple form validation.

    let errors = [];

    form
      .filter((formItem) => formItem.hidden !== true)
      .forEach((item) => {
        const itemValid = validateItem(item);
        if (!itemValid) {
          errors.push(item);
        }
        // Swap bool to error instead, it is better suited for the inputs error property.
        item.error = !itemValid;
      });

    return errors;
  };

  /**
   * Handles the execution of the app.
   * Retrieves the results of the app execution from the FmeFlow API.
   * Clears the vector source and adds the retrieved features to it.
   * Fits the map view to the extent of the vector layer.
   */
  const handleExecution = async () => {
    const formErrors = validateForm();
    const formIsValid = formErrors.length === 0;

    // Trigger the form to be re-rendered. We want the error colors etc.
    refreshForm(form);

    if (!formIsValid) {
      console.log("formErrors", formErrors);
      return;
    }

    startLoading({ text: "Kör. V.g. vänta." });

    // Retrieve the results of the app execution from the FmeFlow API
    const results = await fmeAppsService.getDataStreamingServiceResults(
      app,
      form
    );

    if (results.error) {
      handleResponseError(results);
      return;
    }

    try {
      layerController.applyResultDataToMap(results);
    } catch (error) {
      console.error(`applyResultDataToMap: ${error.message}`);
    }

    stopLoading();
  };

  const handleReset = () => {
    layerController.clearTiffSource();
    layerController.clearVectorSource();
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
          handleReset();
          setInfoIsVisible(false);
          setApp(null);
        }}
        onSelectApp={handleAppClick}
        onInfo={() => {
          setInfoIsVisible(!infoIsVisible);
        }}
        list={options.applicationList}
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
          <Grid item xs={6} sx={{ display: "flex" }}>
            <Button
              variant="text"
              onClick={handleReset}
              endIcon={<LayersClear />}
            >
              Rensa
            </Button>
          </Grid>
        )}
        {app && (
          <Grid
            item
            xs={6}
            sx={{ justifyContent: "flex-end", display: "flex" }}
          >
            <Button
              variant="contained"
              onClick={handleExecution}
              endIcon={<ArrowForward />}
            >
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
