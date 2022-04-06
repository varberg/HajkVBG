import React from "react";
import PropTypes from "prop-types";
import { withSnackbar } from "notistack";
import { withStyles } from "@material-ui/core/styles";
import {
  Container,
  Typography,
  Button,
  FormControl,
  Select,
  MenuItem,
  ListItem,
  Grid,
  FormLabel,
} from "@material-ui/core";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";
import ListResult from "./components/ListResult";
import ListToolbar from "./components/ListToolbar";
import EditMenu from "./components/EditMenu";

const styles = (theme) => {
  return {
    itemList: {
      maxHeight: 250,
      overflowY: "scroll",
      overflowX: "hidden",
      border: "1px solid rgba(0, 0, 0, .125)",
    },
    dropdown: {
      width: "50%",
    },
    listHeading: {
      fontWeight: theme.typography.fontWeightMedium,
    },
  };
};

const defaultState = {
  mode: "realEstate",
  selectionExists: false,
  currentListResults: {
    realEstate: [],
    coordinate: [],
    area: [],
    survey: [],
    contamination: [],
  },
  listToolsMode: "none",
  isEditMenuOpen: false,
  newFeature: null,
  activeSupportLayerName: null,
  activeSupportLayerSource: null,
};

const showDevelopmentOnlyButtons = true;

//TODO - move this? where to place constant information on the different modes - the model?
const modeDisplay = {
  realEstate: {
    displayName: "Fastighet",
    displayNamePlural: "Fastigheter",
  },
  coordinate: { displayName: "Koordinat", displayNamePlural: "Koordinater" },
  area: { displayName: "Område", displayNamePlural: "Områden" },
  survey: { displayName: "Undersökning", displayNamePlural: "Undersökningar" },
  contamination: {
    displayName: "Förorening",
    displayNamePlural: "Föroreningar",
  },
};

class IntegrationView extends React.PureComponent {
  state = defaultState;

  static propTypes = {
    model: PropTypes.object.isRequired,
    app: PropTypes.object.isRequired,
    classes: PropTypes.object.isRequired,
    localObserver: PropTypes.object.isRequired,
    globalObserver: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);

    this.globalObserver = props.globalObserver;
    this.localObserver = props.localObserver;
    this.model = props.model;
    this.app = props.app;

    this.#init();
    this.#bindSubscriptions();
    this.model.initEdpConnection();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("window-opened", () => {
      this.#initDrawingSupport();
    });
    this.localObserver.subscribe("mf-window-closed", () => {
      this.#clearDrawingSupport();
      this.#clearAllDataSources();
      this.#clearAllInteractions();
      this.#clearMode();
    });
    this.localObserver.subscribe("mf-geometry-selected-from-map", (feature) => {
      this.#clickRowFromMapInteraction(feature);
    });
    this.localObserver.subscribe("mf-wfs-map-updated-features", (props) => {
      this.#updateList(props);
    });
    this.localObserver.subscribe("mf-kubb-connection-established", () => {
      this.props.enqueueSnackbar("Lyckad uppkoppling mot EDP Vision", {
        variant: "info",
        persist: false,
      });
    });
    this.localObserver.subscribe("mf-kubb-connection-rejected", () => {
      this.props.enqueueSnackbar("Misslyckad uppkoppling mot EDP Vision", {
        variant: "error",
        persist: false,
      });
    });
    this.localObserver.subscribe("mf-kubb-message-received", (message) => {
      let snackMessage = `Inläsning av ${message.nativeType} från EDP Vision`;
      if (message.nativeKind === "receive")
        snackMessage = `Inläsning av ${message.nativeType} från EDP Vision`;
      else if (message.nativeKind === "send")
        snackMessage = `Skickat ${message.nativeType} till EDP Vision`;
      this.props.enqueueSnackbar(snackMessage, {
        variant: "info",
        persist: false,
      });
    });
    this.localObserver.subscribe("mf-wfs-failed-search", (error) => {
      let displayName =
        this.props.model.options.mapObjects[this.state.mode].displayName;
      this.props.enqueueSnackbar(
        `Sökning mot ${displayName} kunde inte genomföras`,
        {
          variant: "error",
          persist: false,
        }
      );
    });
    this.localObserver.subscribe("mf-start-draw-new-geometry", () => {
      this.newGeometryFunctions[this.state.mode]();
    });
    this.localObserver.subscribe("mf-end-draw-new-geometry", (status) => {
      this.#newGeometryFinished(status);
    });

    this.localObserver.subscribe("mf-edit-supportLayer", (editTarget) => {
      this.setState({
        activeSupportLayerName: editTarget.name,
        activeSupportLayerSource: editTarget.sourceName,
      });
      this.#showDrawingSupport(editTarget.layerId);
      this.editFunctions[editTarget.type].start(
        editTarget.sourceName,
        editTarget
      );
    });
    this.localObserver.subscribe("mf-edit-noSupportLayer", (editTarget) => {
      this.#hideDrawingSupport(editTarget.layerId);
      this.editFunctions[editTarget.type].end(editTarget.sourceName);
      this.setState({
        activeSupportLayerName: null,
        activeSupportLayerSource: null,
      });
    });

    this.localObserver.subscribe("mf-new-feature-pending", (feature) => {
      let newFeature = { features: [feature], isNew: true };
      this.setState({ newFeature: newFeature });
    });
  };

  #init = () => {
    this.drawingSupportLayerNames = this.props.model.wmsConfig;
    this.#initUpdateFunctions();
    this.#initClearFunctions();
    this.#initDrawFunctions();
    this.#initNewGeometryFunctions();
    this.#initEditFunctions();
    //this.#initUpdateEditToolsFunctions();
    this.#initDrawTypes();
    this.#initPublishDefaultMode();
    if (this.app.plugins.mfintegration?.options?.visibleAtStart)
      this.#initDrawingSupport();
  };

  #initUpdateFunctions = () => {
    this.updateListFunctions = {
      realEstate: this.#updateRealEstateList,
      coordinate: this.#updateCoordinateList,
      area: this.#updateAreaList,
      survey: this.#updateSurveyList,
      contamination: this.#updateContaminationList,
    };
  };

  #initClearFunctions = () => {
    this.clearFunctions = {
      realEstate: this.#clearResultsRealEstate,
      coordinate: this.#clearResultsCoordinates,
      area: this.#clearResultsArea,
      survey: this.#clearResultsSurvey,
      contamination: this.#clearResultsContamination,
    };
    this.#addArrayToObject(this.clearFunctions);
  };

  #addArrayToObject = (object) => {
    const array = Object.keys(object).map((key) => {
      return object[key];
    });
    object.array = array;
  };

  #initDrawFunctions = () => {
    this.drawFunctions = {
      pointcombine: {
        start: this.props.model.startDrawCombinePoint,
        end: this.props.model.endDrawCombine,
      },
      pointcopy: {
        start: this.props.model.startDrawCopyPoint,
        end: this.props.model.endDrawCopy,
      },
      pointnew: {
        start: this.props.model.startDrawNewPoint,
        end: this.props.model.endDrawNew,
      },
      polygonnew: {
        start: this.props.model.startDrawNewPolygon,
        end: this.props.model.endDrawNew,
      },
      pointselect: {
        start: this.props.model.startDrawSearchPoint,
        end: this.props.model.endDraw,
      },
      polygonselect: {
        start: this.props.model.startDrawSearchPolygon,
        end: this.props.model.endDraw,
      },
    };
  };

  #initNewGeometryFunctions = () => {
    this.newGeometryFunctions = {
      realEstate: this.drawFunctions.polygonnew.start,
      coordinate: this.drawFunctions.pointnew.start,
      area: this.drawFunctions.polygonnew.start,
      survey: this.drawFunctions.polygonnew.start,
      contamination: this.drawFunctions.polygonnew.start,
    };
  };

  #initEditFunctions = () => {
    this.editFunctions = {
      copy: { start: this.model.startDrawCopyPoint, end: this.model.endDraw },
      combine: {
        start: this.model.startDrawCombinePoint,
        end: this.model.endDraw,
      },
      snap: {
        start: this.model.addSnapInteraction,
        end: this.model.endSnapInteraction,
      },
    };
  };

  //TODO - this should come from the where the modes (realEstate etc are configured).
  #initDrawTypes = () => {
    this.drawTypes = {
      combine: {
        realEstate: "none",
        coordinate: "none",
        area: "point",
        survey: "point",
        contamination: "point",
      },
      copy: {
        realEstate: "none",
        coordinate: "point",
        area: "point",
        survey: "point",
        contamination: "point",
      },
      new: {
        realEstate: "none",
        coordinate: "point",
        area: "polygon",
        survey: "polygon",
        contamination: "polygon",
      },
    };
  };

  #initPublishDefaultMode = () => {
    this.localObserver.publish("mf-new-mode", defaultState.mode);
  };

  #initDrawingSupport = () => {
    this.#showDrawingSupport(this.drawingSupportLayerNames[defaultState.mode]);
  };

  #showDrawingSupport = (layerId) => {
    this.#showOrHideDrawingSupport(layerId, true);
  };

  #hideDrawingSupport = (layerId) => {
    this.#showOrHideDrawingSupport(layerId, false);
  };

  #showOrHideDrawingSupport = (layerId, visible) => {
    const foundDrawingSupportLayer =
      this.#getDrawingSupportLayer(layerId).shift();
    if (foundDrawingSupportLayer) foundDrawingSupportLayer.setVisible(visible);
  };

  #clearDrawingSupport = () => {
    this.#hideDrawingSupport(this.drawingSupportLayerNames[this.state.mode]);
  };

  #clearAllDataSources = () => {
    for (const clearFunction of this.clearFunctions.array) clearFunction();
    this.props.model.clearHighlight();
    this.props.model.clearEdit();
  };

  #clearAllInteractions = () => {
    this.props.model.clearInteractions();
  };

  #clearMode = () => {
    this.setState({ mode: defaultState.mode });
  };

  #getDrawingSupportLayer = (layerId) => {
    if (!layerId) return [];
    const layers = this.app.map
      .getLayers()
      .getArray()
      .filter((layer) => layer.get("layerInfo"));
    return layers.filter((layer) => {
      if (layer.getProperties().name === layerId) return layer;
      return false;
    });
  };

  #addNewItemToList = (data) => {
    data.type = this.state.mode;
    this.#updateList(data);
  };

  #addNewItemToSource = (data) => {
    const feature = data?.features[0];
    this.props.model.addFeatureToNewSource(feature, this.state.mode);
  };

  #removeOldEditItemFromSource = (data, editMode) => {
    const feature = data?.features[0];
    this.props.model.removeFeatureFromEditSource(feature, editMode);
  };

  #clickRowFromMapInteraction = (selectedFeature) => {
    let featuresInList = { ...this.state.currentListResults[this.state.mode] };
    this.#addArrayToObject(featuresInList);

    const clickedFeature = featuresInList.array
      .filter((listFeature) => {
        if (selectedFeature.ol_uid === listFeature.feature.ol_uid)
          return listFeature;
        return false;
      })
      .shift();

    this.#clickedRowFromMap(clickedFeature);
    this.#clickRow(clickedFeature, this.state.mode);
  };

  #updateList = (props) => {
    this.updateListFunctions[props.type](props);
    this.model.updateKubbWithData(
      this.state.currentListResults[props.type],
      props.type
    );
  };

  #updateRealEstateList = (props) => {
    //not allowed to add new real estate items.
    let id = -1;
    const realEstateData = props.features.map((feature) => {
      const properties = feature.getProperties();
      return {
        id: ++id,
        fnr: properties[props.propertyName],
        name: properties.fastighet,
        municipality: properties.trakt,
        information: [
          {
            description: "Fastighetsnummer",
            value: properties[props.propertyName],
          },
          { description: "Trakt", value: properties.trakt },
        ],
        visible: true,
        selected: false,
        feature: feature,
      };
    });
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        realEstate: realEstateData,
      },
    });
  };

  #updateCoordinateList = (props) => {
    let id = -1;
    if (props.isNew) {
      id = this.state.currentListResults.coordinate.length - 1;
    }
    let coordinateData = props.features.map((coordinate) => {
      const properties = coordinate.getProperties();
      const coordinateText =
        "(" +
        coordinate.getGeometry().flatCoordinates[0] +
        "; " +
        coordinate.getGeometry().flatCoordinates[1] +
        ")";
      const name = props.isNew
        ? "Ny koordinat"
        : properties?.label?.length > 0
        ? properties.label
        : coordinateText;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "Label",
            value: properties?.label?.length > 0 ? properties?.label : "-",
          },
          { description: "Koordinat", value: coordinateText },
        ],
        visible: true,
        selected: false,
        feature: coordinate,
        isNew: props.isNew,
      };
    });
    if (props.isNew) {
      let currentData = this.state.currentListResults.coordinate;
      coordinateData.forEach((element) => {
        currentData.unshift(element);
      });
      coordinateData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        coordinate: coordinateData,
      },
    });
  };

  #updateAreaList = (props) => {
    let id = -1;
    if (props.isNew) id = this.state.currentListResults.area.length - 1;
    let areaData = props.features.map((feature) => {
      const properties = feature.getProperties();
      const name = props.isNew ? `Nytt område` : properties.omrade;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "saknas",
            value: properties["saknas"],
          },
        ],
        visible: true,
        selected: false,
        feature: feature,
        isNew: props.isNew,
      };
    });

    //If we are adding a newly drawn area (not a search), the existing list items should remain.
    if (props.isNew) {
      let currentData = this.state.currentListResults.area;
      areaData.forEach((element) => {
        currentData.unshift(element);
      });
      areaData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        area: areaData,
      },
    });
  };

  #updateSurveyList = (props) => {
    let id = -1;
    if (props.isNew) id = this.state.currentListResults.survey.length - 1;
    let surveyData = props.features.map((feature) => {
      const properties = feature.getProperties();
      const name = props.isNew ? "Ny undersökning" : properties.omrade;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "saknas",
            value: properties["saknas"],
          },
        ],
        visible: true,
        selected: false,
        feature: feature,
        isNew: props.isNew,
      };
    });

    if (props.isNew) {
      let currentData = this.state.currentListResults.survey;
      surveyData.forEach((element) => {
        currentData.unshift(element);
      });
      surveyData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        survey: surveyData,
      },
    });
  };

  #updateContaminationList = (props) => {
    let id = -1;
    if (props.isNew)
      id = this.state.currentListResults.contamination.length - 1;
    let contaminationData = props.features.map((feature) => {
      const properties = feature.getProperties();
      const name = props.isNew ? "Ny förorening" : properties.omrade;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "saknas",
            value: properties["saknas"],
          },
        ],
        visible: true,
        selected: false,
        feature: feature,
        isNew: props.isNew,
      };
    });

    if (props.isNew) {
      let currentData = this.state.currentListResults.contamination;
      contaminationData.forEach((element) => {
        currentData.unshift(element);
      });
      contaminationData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        contamination: contaminationData,
      },
    });
  };

  #newGeometryFinished = (status) => {
    if (status.saveGeometry) {
      this.#addNewItemToList(this.state.newFeature);
      this.#addNewItemToSource(this.state.newFeature);
      this.#removeOldEditItemFromSource(this.state.newFeature, status.editMode);
    }
    if (!status.saveGeometry) this.model.abortDrawFeature(status.editMode);

    this.setState({ newFeature: null });
    const drawType =
      this.drawTypes[status.editMode][this.state.mode] + status.editMode;
    this.drawFunctions[drawType].end();
    this.model.clearInteractions();
  };

  #toggleMode = (mode) => {
    this.#unselectAllFeatures(this.state.mode);
    this.#hideDrawingSupport(this.drawingSupportLayerNames[this.state.mode]);
    this.setState({
      mode: mode,
    });
    //only show drawing support if the mode says we should according to it's config.
    this.#showDrawingSupport(this.drawingSupportLayerNames[mode]);
    this.localObserver.publish("mf-new-mode", mode);
  };

  #unselectAllFeatures = (mode) => {
    this.state.currentListResults[mode].map((feature) => {
      feature.selected = false;
      return null;
    });
  };

  #clickedRowFromList = (clickedFeature) => {
    clickedFeature.selectedFromList = true;
    clickedFeature.selectedFromMap = false;
  };

  #clickedRowFromMap = (clickedFeature) => {
    clickedFeature.selectedFromList = false;
    clickedFeature.selectedFromMap = true;
  };

  #clickRow = (clickedItem, mode) => {
    /*
    Update the state of the clicked item with it's new selection status (selected or not selected).    
    Update selectionExists - A boolean flag of whether there is any selection at all. This is used 
    to help us know whether the edit menu should be available or not, without having to check the selection
    status of the list items.
    */
    this.localObserver.publish("mf-item-list-clicked", clickedItem);

    let updateList = { ...this.state.currentListResults };
    //search the results list for the existing selection status of the clicked item.
    let isSelected = !updateList[mode].find(
      (listItem) => listItem.id === clickedItem.id
    ).selected;

    const updatedResults = updateList[mode].map((listItem) => {
      if (listItem.id === clickedItem.id)
        return { ...listItem, selected: isSelected };
      return { ...listItem, selected: false };
    });
    updateList[mode] = updatedResults;

    //Because we only allow one selected item at a time, and because switching modes clears the selection,
    //we can set the overall selectionExists flag based on the clicked item's selection status.
    let selectionExists = isSelected;

    this.setState({
      currentListResults: updateList,
      selectionExists: selectionExists,
    });
  };

  #zoomFeatureInOrOut = (clickedItem) => {
    if (!this.zoomedIn) {
      this.model.zoomToFeature(clickedItem.feature);
      this.zoomedIn = true;
      return;
    }
  };

  #removeFromResults = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    const updatedResults = updateList[mode].filter(
      (listItem) => listItem.id !== item.id
    );

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });

    this.props.model.removeItemFromActiveSource(item);
  };

  #removeCreatedItemFromResults = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    const updatedResults = updateList[mode].filter(
      (listItem) => listItem.id !== item.id
    );

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });
    this.props.model.removeItemFromNewSource(item);
  };

  #clearResults = () => {
    this.clearFunctions[this.state.mode]();
    this.props.model.clearHighlight();
  };

  toggleResultItemVisibility = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    let shouldBeVisible = !updateList[mode].find(
      (listItem) => listItem.id === item.id
    ).visible;

    const updatedResults = updateList[mode].map((listItem) => {
      if (listItem.id === item.id)
        return { ...listItem, visible: shouldBeVisible };
      return listItem;
    });

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });

    this.props.model.toggleFeatureStyleVisibility(
      item.feature,
      shouldBeVisible
    );
  };

  #clearResultsRealEstate = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        realEstate: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsCoordinates = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        coordinate: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsArea = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        area: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsSurvey = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        survey: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsContamination = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        contamination: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #endListToolsMode = (listToolsMode) => {
    this.drawFunctions[listToolsMode]?.end();
  };

  #startListToolsMode = (listToolsMode) => {
    this.drawFunctions[listToolsMode]?.start(this.state.mode);
  };

  #reactivateUpdateDrawingMode = (editMode) => {
    if (editMode === "new") {
      this.newGeometryFunctions[this.state.mode]();
    } else {
      this.editFunctions[editMode].start(this.state.activeSupportLayerSource);
    }
  };

  #handleActivateUpdateTool = (updateTool, editMode) => {
    if (updateTool !== null) {
      this.props.model.activateUpdateTool(updateTool, editMode);
    } else {
      this.props.model.endActiveUpdateTool();
      this.#reactivateUpdateDrawingMode(editMode);
    }
  };

  #handleDeleteNewEdit = (editMode) => {
    //clear existing interactions, we will add the draw interaction back at the end.
    this.props.model.clearInteractions();

    //Remove any features from NewFeature source.
    this.state.newFeature.features.forEach((feature) => {
      this.props.model.editSources[editMode].removeFeature(feature);
    });
    this.setState({ newFeature: null });
    this.#reactivateUpdateDrawingMode(editMode);
  };

  renderEditMenu = () => {
    return (
      <EditMenu
        model={this.props.model}
        localObserver={this.localObserver}
        selectionExists={this.state.selectionExists}
        layerMode={this.state.mode}
        combineEditMode={this.drawTypes.combine[this.state.mode]}
        copyEditMode={this.drawTypes.copy[this.state.mode]}
        newEditMode={this.drawTypes.new[this.state.mode]}
        handleChangeUpdateTool={this.#handleActivateUpdateTool}
        handleDeleteNewEdit={this.#handleDeleteNewEdit}
        handleUpdateIsEditMenuOpen={(open) => {
          this.setState({ isEditMenuOpen: open });
          //deactivate any active listtools when opening search.
          if (open) this.setState({ listToolsMode: "none" });
        }}
        newFeature={this.state.newFeature}
      />
    );
  };

  renderListTools = () => {
    return (
      <ListToolbar
        disabled={this.state.isEditMenuOpen}
        listToolsMode={this.state.listToolsMode}
        handleClearResults={() => {
          this.#clearResults();
        }}
        handleUpdateListToolsMode={(newMode) => {
          this.setState({ listToolsMode: newMode });
        }}
      />
    );
  };

  //TODO - these buttons are temporary, while Kubb data is being mocked by buttons instead of received by SignalR events.
  //These will be removed.
  renderTemporaryDummyButtons = () => {
    return (
      <div>
        {this.state.mode === "realEstate" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testRealEstatesFromKUBB();
                //this.props.model.initEdpConnection();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa fastigheter
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "coordinate" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testCoordinatesFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa koordinater
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "area" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testAreasFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa områden
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "survey" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testSurveysFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa undersökningar
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "contamination" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testContaminationsFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa föroreningar
            </Button>
          </ListItem>
        ) : null}
      </div>
    );
  };

  componentDidUpdate(prevProps, prevState) {
    //keep track of the mode that the list tools are in.
    if (prevState.listToolsMode !== this.state.listToolsMode) {
      let previousMode = prevState.listToolsMode;
      this.#endListToolsMode(previousMode);
      this.#startListToolsMode(this.state.listToolsMode);
    }
  }

  render() {
    const { classes, options } = this.props;
    const { mode } = this.state;
    return (
      <Container disableGutters>
        <Grid container spacing={(1, 1)}>
          <Grid item xs={12}>
            <Typography paragraph>{options.instruction}</Typography>
          </Grid>
          <Grid item xs={12}>
            <FormControl className={classes.dropdown}>
              <FormLabel>Välj kartobjekt</FormLabel>
              <Select
                style={{ marginTop: "0px" }}
                id="modeSelection"
                displayEmpty
                value={mode}
                onChange={(e) => {
                  this.#toggleMode(e.target.value);
                }}
              >
                <MenuItem value={"realEstate"}>Fastigheter</MenuItem>
                <MenuItem value={"coordinate"}>Koordinater</MenuItem>
                <MenuItem value={"area"}>Områden</MenuItem>
                <MenuItem value={"survey"}>Undersökningar</MenuItem>
                <MenuItem value={"contamination"}>Föroreningar</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {this.renderListTools()}
          <Grid item xs={12}>
            <Typography variant="subtitle1" className={classes.listHeading}>
              {`Markerade ${modeDisplay[mode][
                "displayNamePlural"
              ].toLowerCase()}`}
              {this.state.currentListResults[mode].length > 0
                ? ` (${this.state.currentListResults[mode].length})`
                : null}
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <div>
              {this.state.currentListResults[mode].length > 0 ? (
                <div className={classes.itemList}>
                  {this.state.currentListResults[mode].map((item) => {
                    let refName = item.feature.ol_uid;
                    this.model.listItemRefs[refName] = React.createRef();
                    return (
                      <ListResult
                        model={this.props.model}
                        key={item.id}
                        item={item}
                        listMode={mode}
                        handleClickItem={(clickedItem, mode) => {
                          this.#clickedRowFromList(clickedItem);
                          this.#clickRow(clickedItem, mode);
                        }}
                        handledZoomItem={(clickedItem) => {
                          this.#zoomFeatureInOrOut(clickedItem);
                        }}
                        handleRemoveItem={(item, mode) => {
                          this.#removeFromResults(item, mode);
                        }}
                        handleRemoveCreatedItem={(item, mode) => {
                          this.#removeCreatedItemFromResults(item, mode);
                        }}
                        handleToggleItemVisibilty={(item, mode) => {
                          this.toggleResultItemVisibility(item, mode);
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                `Inga ${modeDisplay[mode]["displayNamePlural"]} valda.`
              )}
            </div>
          </Grid>
          {showDevelopmentOnlyButtons && (
            <Grid item xs={12}>
              {this.renderTemporaryDummyButtons()}
            </Grid>
          )}
          <Grid container item xs={12} style={{ marginTop: "16px" }}>
            {this.renderEditMenu()}
          </Grid>
        </Grid>
      </Container>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));
