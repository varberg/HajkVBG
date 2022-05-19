import { click } from "ol/events/condition";
import { createMapStyles } from "./MapStyles";
import Draw from "ol/interaction/Draw";
import { extend, createEmpty } from "ol/extent";
import Feature from "ol/Feature";
import { Fill, Stroke, Style, Circle } from "ol/style";
import Point from "ol/geom/Point";
import Select from "ol/interaction/Select";
import Modify from "ol/interaction/Modify";
import Snap from "ol/interaction/Snap";
import Translate from "ol/interaction/Translate";
import Transform from "./Transformation/Transform";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { HubConnectionBuilder } from "@microsoft/signalr";
import WKT from "ol/format/WKT";
import { polygon } from "@turf/helpers";
import difference from "@turf/difference";
import intersect from "@turf/intersect";
import union from "@turf/union";

class IntegrationModel {
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.options = settings.options;
    this.localObserver = settings.localObserver;
    this.searchModel = settings.searchModel;
    this.listItemRefs = {};
    this.#init();
    this.#bindSubscriptions();
  }

  #createWmsConfig = (options) => {
    let wmsConfig = {};
    Object.keys(options.mapObjects).forEach((key) => {
      wmsConfig[key] = options.mapObjects[key].wmsId;
    });
    return wmsConfig;
  };

  #bindSubscriptions = () => {
    this.localObserver.subscribe("mf-new-mode", (mode) => {
      this.#modeChanged(mode);
    });
    this.localObserver.subscribe("mf-item-list-clicked", (clickedItem) => {
      this.#highlightItem(clickedItem);
    });
    this.localObserver.subscribe("mf-wfs-search", (data) => {
      this.#handleWfsSearch(data);
    });
  };

  #init = () => {
    this.handleWindowOpen();
    this.mapStyles = createMapStyles(this.options);
    this.wmsConfig = this.#createWmsConfig(this.options);
    this.#initSearchModelFunctions();
    this.#initSearchResponseFunctions();
    this.#initDrawingFunctions();
    this.#initAbortDrawingFunctions();
    this.#initCombineFunctions();
    this.#addLayers();
    this.#initActiveSource();
    this.#initKubbData();
  };

  #initSnap = (mode) => {
    this.snapMode = mode;
    this.map.on("pointermove", this.#snapPointerMove);
  };

  #snapPointerMove = (e) => {
    if (!e.coordinate) return;

    let snapWfsSearch = true;
    this.map.forEachFeatureAtPixel(e.pixel, (snappedGeometry) => {
      const searchField = this.options.mapObjects[this.snapMode].wfsSearchField;
      const foundFeatureInSource = this.#getFeatureInSource(
        this.activeSnapSource.getFeatures(),
        snappedGeometry,
        searchField
      );
      if (foundFeatureInSource) snapWfsSearch = false;
      return false;
    });

    if (snapWfsSearch) this.#snapPointWfsSearch(e.coordinate, this.snapMode);
  };

  #snapPointWfsSearch = (coordinates, mode) => {
    const feature = new Feature({ geometry: new Point(coordinates) });
    this.searchModelFunctions[mode](feature);
  };

  #initSearchModelFunctions = () => {
    this.searchModelFunctions = {
      realEstate: this.searchModel.findRealEstatesWithGeometry,
      coordinate: this.searchModel.findCoordinatesWithGeometry,
      area: this.searchModel.findAreasWithGeometry,
      survey: this.searchModel.findSurveysWithGeometry,
      contamination: this.searchModel.findContaminationsWithGeometry,
    };
  };

  #initSearchResponseFunctions = () => {
    this.searchResponseFunctions = {
      combine: this.#combine,
      copy: this.#copyWfsSearch,
      search: this.#addWfsSearch,
      snap: this.#snapWfsSearch,
    };
  };

  #initDrawingFunctions = () => {
    this.drawingToolFunctions = {
      combine: {
        callback: this.#handleDrawCombineFeatureAddedDelayed,
        source: this.#createNewVectorSource(),
      },
      copy: {
        callback: this.#handleDrawCopyFeatureAdded,
        source: this.#createNewVectorSource(),
      },
      new: {
        callback: this.#handleDrawNewFeatureAdded,
        source: this.#createNewVectorSource(),
      },
      search: {
        callback: this.#handleDrawSearchFeatureAdded,
        source: this.#createNewVectorSource(),
      },
    };
  };

  #initAbortDrawingFunctions = () => {
    this.drawingAbortToolFunctions = {
      combine: this.#abortCombineTool,
      copy: this.#abortCopyTool,
      new: this.#abortNewTool,
    };
  };

  #initCombineFunctions = () => {
    this.combineFunctions = {
      union: this.#combineUnion,
      difference: this.#combineDifference,
      intersect: this.#combineIntersect,
    };
  };

  startDrawCombinePoint = (mode, editTarget) => {
    this.combineMethod = editTarget.combineMethod || "union";
    this.drawingToolFunctions.combine.source.mode = mode;
    this.#drawGeometry("combine", "Point", this.mapStyles.editFeatureStyle);
  };

  startDrawCopyPoint = (mode) => {
    this.drawingToolFunctions.copy.source.mode = mode;
    this.#drawGeometry("copy", "Point", this.mapStyles.editFeatureStyle);
  };

  startDrawNewPoint = (mode) => {
    this.drawingToolFunctions.new.source.mode = mode;
    this.#drawGeometry("new", "Point", this.mapStyles.editFeatureStyle);
  };

  startDrawNewPolygon = (mode) => {
    this.drawingToolFunctions.new.source.mode = mode;
    this.#drawGeometry("new", "Polygon", this.mapStyles.editFeatureStyle);
  };

  startDrawSearchPoint = (mode) => {
    this.#removeMapSelecton();
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Point", this.mapStyles.drawSearchStyle);
  };

  startDrawSearchPolygon = (mode) => {
    this.#removeMapSelecton();
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Polygon", this.mapStyles.drawSearchStyle);
  };

  addSnapInteraction = (mode) => {
    this.searchResponseTool = "snap";
    this.activeSnapSource = this.snapSources[mode];
    this.#initSnap(mode);
    this.snapInteraction = new Snap({ source: this.activeSnapSource });
    this.map.addInteraction(this.snapInteraction);
  };

  #addMapSelection = () => {
    // Fix for multiple select interactions, they have an ability to multiply themselves.
    // Removing all select interactions will counteract the bug.
    if (this.selectInteraction) this.#removeMapSelecton();

    this.selectInteraction = new Select({
      condition: click,
      style: null,
    });
    this.map.addInteraction(this.selectInteraction);
    this.selectInteraction.on("select", this.#selectClick);
    this.map.on("singleclick", this.#selectSingleClick);
  };

  #selectClick = (e) => {
    const selectedFeature = e.selected[0];
    this.localObserver.publish(
      "mf-geometry-selected-from-map",
      selectedFeature
    );
    this.selectedFeatureFromMap = selectedFeature;
    this.selectInteraction.getFeatures().clear();
  };

  #selectSingleClick = (e) => {
    const selectedFeature = this.map.forEachFeatureAtPixel(
      e.pixel,
      (feature) => {
        return feature;
      }
    );
    if (this.selectedFeatureFromMap && !selectedFeature) {
      this.localObserver.publish(
        "mf-geometry-selected-from-map",
        this.selectedFeatureFromMap
      );
      this.selectedFeatureFromMap = null;
    }
  };

  /**
   * Removes all select mapinteractions. They have an ability to multiply themselves.
   */
  #removeMapSelecton = () => {
    const selectInteractions = this.map
      .getInteractions()
      .array_.filter((interaction) => {
        if (interaction === this.selectInteraction) return true;
        return false;
      });
    selectInteractions.forEach((interaction) => {
      this.map.removeInteraction(this.selectInteraction);
    });
  };

  endActiveUpdateTool = () => {
    this.clearInteractions();
    this.clearUpdateInteractions();
  };

  activateUpdateTool = (updateTool, editMode, inUpdateTab) => {
    const source = inUpdateTab ? "new" : editMode;
    //Firstly, as the active update tool has changed, end any existing update tool.
    this.endActiveUpdateTool();
    switch (updateTool) {
      case "modify":
        this.#modifyGeometry(source);
        break;
      case "move":
        this.#moveGeometry(source);
        break;
      default:
        return;
    }
  };

  #modifyGeometry = (source) => {
    //Remove interactions not needed for the moving tool (draw and select).
    this.clearInteractions();

    //Add a temporary select interaction, where only features current editing layer may be selected.
    let selectLayer = this.editLayers[source];
    this.updateSelect = new Select({
      layers: [selectLayer],
    });
    this.updateSelect.on("select", this.#updateStarted);
    //Add a temporary Modify interaction, that will be removed when when modify is no longer the chosen update tool.
    this.modifyInteraction = new Modify({
      features: this.updateSelect.getFeatures(),
    });
    this.map.addInteraction(this.updateSelect);
    this.map.addInteraction(this.modifyInteraction);
  };

  #moveGeometry = (source) => {
    //Remove interactions not needed for the moving tool (draw and select).
    this.clearInteractions();

    //Add a temporary select interaction, where only features current editing layer may be selected.
    let selectLayer = this.editLayers[source];
    this.updateSelect = new Select({
      layers: [selectLayer],
    });
    this.updateSelect.on("select", this.#updateStarted);
    //Add a translate interaction,
    this.moveInteraction = new Translate({
      features: this.updateSelect.getFeatures(),
    });
    this.map.addInteraction(this.updateSelect);
    this.map.addInteraction(this.moveInteraction);
  };

  #updateStarted = () => {
    this.localObserver.publish("mf-feature-edit-started");
  };

  clearInteractions = () => {
    this.endDraw();
    this.endSnapInteraction();
    this.clearUpdateInteractions();
  };

  clearUpdateInteractions = () => {
    if (this.updateSelect) {
      this.map.removeInteraction(this.updateSelect);
    }
    if (this.moveInteraction) {
      this.map.removeInteraction(this.moveInteraction);
    }
    if (this.modifyInteraction) {
      this.map.removeInteraction(this.modifyInteraction);
    }
  };

  endDraw = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete(this.drawingTool);
    this.drawingTool = "none";
    this.#addMapSelection();
  };

  endDrawCombine = () => {
    this.combineFeature = null;
    this.combinedGeometries = null;
    this.map.clickLock.delete("combine");
    this.#clearSource(this.editSources.combine);
    this.endDraw();
  };

  endDrawCopy = () => {
    this.map.clickLock.delete("copy");
    this.endDraw();
  };

  endDrawNew = () => {
    this.map.clickLock.delete("new");
    this.endDraw();
  };

  endUpdate = () => {
    this.#publishNewFeature(this.updatedFeature);
    this.localObserver.publish("mf-geometry-selected-from-map", null);
  };

  endSnapInteraction = () => {
    this.searchResponseTool = "snap";
    this.activeSnapSource = null;
    this.map.removeInteraction(this.snapInteraction);
    this.map.un("pointermove", this.#snapPointerMove);
  };

  clearResults = (mode) => {
    this.#clearSource(this.dataSources[mode]);
    this.#clearSource(this.newSources[mode]);
  };

  clearHighlight = () => {
    this.#clearSource(this.highlightSource);
  };

  clearEdit = () => {
    Object.keys(this.editSources).forEach((key) => {
      this.#clearSource(this.editSources[key]);
    });
  };

  removeItemFromActiveSource = (clickedItem) => {
    if (this.#isFeatureHighlighted(clickedItem.feature))
      this.highlightSource.removeFeature(clickedItem.feature);
    this.activeSource.removeFeature(clickedItem.feature);
  };

  removeItemFromNewSource = (clickedItem) => {
    if (this.#isFeatureHighlighted(clickedItem.feature))
      this.highlightSource.removeFeature(clickedItem.feature);
    this.activeNewSource.removeFeature(clickedItem.feature);
  };

  addFeatureToNewSource = (feature, mode) => {
    this.newSources[mode].addFeature(feature);
  };

  removeFeatureFromEditSource = (feature, editMode) => {
    this.editSources[editMode].removeFeature(feature);
  };

  abortDrawFeature = (editMode) => {
    if (!editMode || editMode === "none") return;
    this.drawingAbortToolFunctions[editMode]();
  };

  toggleFeatureStyleVisibility = (feature, shouldBeVisible) => {
    let featureStyle = new Style();
    if (shouldBeVisible) featureStyle = null;

    this.setFeatureStyle(feature, featureStyle);
  };

  #clearSource = (source) => {
    source?.clear();
  };

  #createNewVectorSource = () => {
    return new VectorSource({ wrapX: false });
  };

  #createNewVectorLayer = (source, style) => {
    return new VectorLayer({
      source: source,
      style: style,
    });
  };

  #createLayerStyle = (style) => {
    return new Style({
      stroke: new Stroke({
        color: style.stroke.color,
        width: style.stroke.width,
      }),
      fill: new Fill({
        color: style.fill.color,
      }),
      image: new Circle({
        radius: style.circle.radius,
        stroke: new Stroke({
          color: style.stroke.color,
          width: style.circle.width,
        }),
      }),
    });
  };

  #addLayers = () => {
    this.#addSearchLayer();
    this.#addNewGeometryLayer();
    this.#addMapLayers();
    this.#addHighlightLayer();
  };

  #addSearchLayer = () => {
    const searchLayer = this.#createNewVectorLayer(
      this.drawingToolFunctions.search.source,
      this.#createLayerStyle(this.mapStyles.drawSearchStyle)
    );
    this.map.addLayer(searchLayer);
  };

  #addNewGeometryLayer = () => {
    const newGeometryLayer = this.#createNewVectorLayer(
      this.drawingToolFunctions.new.source,
      this.#createLayerStyle(this.mapStyles.unsavedFeatureStyle)
    );
    this.map.addLayer(newGeometryLayer);
  };

  #addMapLayers = () => {
    this.#addSources();

    this.#addEditLayers();
    this.#addLayersToMap(this.editLayers.array);

    // TODO: Ta bort fyra rader nedan.
    // Slå på om man behöver visa hur snappningen fungerar
    if (false) {
      this.#addSnapLayers();
      this.#addLayersToMap(this.snapLayers.array);
    }

    this.#addDataLayers();
    this.#addLayersToMap(this.dataLayers.array);

    this.#addNewLayers();
    this.#addLayersToMap(this.newLayers.array);
  };

  #addSources = () => {
    this.dataSources = {
      realEstate: this.#createNewVectorSource(),
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };
    this.#addArrayToObject(this.dataSources);

    this.editSources = {
      new: this.#createNewVectorSource(),
      copy: this.#createNewVectorSource(),
      combine: this.#createNewVectorSource(),
    };

    this.snapSources = {
      realEstate: this.#createNewVectorSource(),
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };

    this.newSources = {
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };
  };

  #addEditLayers = () => {
    this.editLayers = {
      new: this.#createNewVectorLayer(
        this.editSources.new,
        this.#createLayerStyle(this.mapStyles.editFeatureStyle)
      ),
      copy: this.#createNewVectorLayer(
        this.editSources.copy,
        this.#createLayerStyle(this.mapStyles.editFeatureStyle)
      ),
      combine: this.#createNewVectorLayer(
        this.editSources.combine,
        this.#createLayerStyle(this.mapStyles.editFeatureStyle)
      ),
    };
    this.#addArrayToObject(this.editLayers);
  };

  #addSnapLayers = () => {
    this.snapLayers = {
      realEstate: this.#createNewVectorLayer(
        this.snapSources.realEstate,
        this.#createLayerStyle(this.mapStyles.snapStyle)
      ),
      coordinate: this.#createNewVectorLayer(
        this.snapSources.coordinate,
        this.#createLayerStyle(this.mapStyles.snapStyle)
      ),
      area: this.#createNewVectorLayer(
        this.snapSources.area,
        this.#createLayerStyle(this.mapStyles.snapStyle)
      ),
      survey: this.#createNewVectorLayer(
        this.snapSources.survey,
        this.#createLayerStyle(this.mapStyles.snapStyle)
      ),
      contamination: this.#createNewVectorLayer(
        this.snapSources.contamination,
        this.#createLayerStyle(this.mapStyles.snapStyle)
      ),
    };
    this.#addArrayToObject(this.snapLayers);
  };

  #addDataLayers = () => {
    this.dataLayers = {
      realEstate: this.#createNewVectorLayer(
        this.dataSources.realEstate,
        this.#createLayerStyle(this.mapStyles.listFeatureStyle)
      ),
      coordinate: this.#createNewVectorLayer(
        this.dataSources.coordinate,
        this.#createLayerStyle(this.mapStyles.listFeatureStyle)
      ),
      area: this.#createNewVectorLayer(
        this.dataSources.area,
        this.#createLayerStyle(this.mapStyles.listFeatureStyle)
      ),
      survey: this.#createNewVectorLayer(
        this.dataSources.survey,
        this.#createLayerStyle(this.mapStyles.listFeatureStyle)
      ),
      contamination: this.#createNewVectorLayer(
        this.dataSources.contamination,
        this.#createLayerStyle(this.mapStyles.listFeatureStyle)
      ),
    };
    this.#addArrayToObject(this.dataLayers);
  };

  #addNewLayers = () => {
    this.newLayers = {
      coordinate: this.#createNewVectorLayer(
        this.newSources.coordinate,
        this.#createLayerStyle(this.mapStyles.unsavedFeatureStyle)
      ),
      area: this.#createNewVectorLayer(
        this.newSources.area,
        this.#createLayerStyle(this.mapStyles.unsavedFeatureStyle)
      ),
      survey: this.#createNewVectorLayer(
        this.newSources.survey,
        this.#createLayerStyle(this.mapStyles.unsavedFeatureStyle)
      ),
      contamination: this.#createNewVectorLayer(
        this.newSources.contamination,
        this.#createLayerStyle(this.mapStyles.unsavedFeatureStyle)
      ),
    };
    this.#addArrayToObject(this.newLayers);
  };

  #addArrayToObject = (object) => {
    const array = Object.keys(object).map((key) => {
      return object[key];
    });
    object.array = array;
  };

  #addLayersToMap = (layerArray) => {
    for (const layer of layerArray) this.map.addLayer(layer);
  };

  #addHighlightLayer = () => {
    this.highlightSource = this.#createNewVectorSource();

    this.highlightLayer = this.#createNewVectorLayer(
      this.highlightSource,
      this.#createLayerStyle(this.mapStyles.selectedListFeatureStyle)
    );
    this.map.addLayer(this.highlightLayer);
  };

  #initActiveSource = () => {
    this.activeSource = this.dataSources.array[0];
  };

  #initKubbData = () => {
    this.kubbData = {
      realEstate: [],
      coordinate: [],
      area: [],
      survey: [],
      contamination: [],
    };
    this.kubbDataFunctions = {
      realEstate: this.#updateKubbWithRealEstate,
      coordinate: this.#updateKubbWithCoordinates,
      area: this.#updateKubbWithAreas,
      survey: this.#updateKubbWithSurveys,
      contamination: this.#updateKubbWithContaminations,
    };
    this.kubbUppdateFeatures = { features: [] };
    this.kubbGeometryId = null;
    this.kubbPendingFeature = null;
    this.kubbHandleFeatureFunctions = {
      1: this.#receiveAreasFromKubb,
      2: this.#receiveSurveysFromKubb,
      3: this.#receiveContaminationsFromKubb,
    };
    this.kubbSendType = null;
    this.kubbSendFeatureFunctions = {
      area: this.#sendAreasToKubb,
      survey: this.#sendSurveysToKubb,
      contamination: this.#sendContaminationsToKubb,
    };
    this.kubbFeedbackFunctions = {
      area: this.searchModel.findAreasWithNumbers,
      survey: this.searchModel.findSurveysWithNumbers,
      contamination: this.searchModel.findContaminationsWithNumbers,
    };
  };

  #drawGeometry = (drawingTool, drawType, style) => {
    this.drawingTool = drawingTool;
    const drawFunctionProps = {
      listenerType: "addfeature",
      requestType: drawingTool,
      style: this.#createLayerStyle(style),
      source: this.drawingToolFunctions[drawingTool].source,
      type: drawType,
    };
    this.#createDrawFunction(drawFunctionProps);
  };

  #createDrawFunction = (drawProps) => {
    this.drawInteraction = new Draw({
      source: drawProps.source,
      type: drawProps.type,
      freehand: false,
      stopClick: true,
      style: drawProps.style,
    });
    this.map.clickLock.add(drawProps.requestType);
    this.map.addInteraction(this.drawInteraction);
    this.#addSnapToDrawFunction();
    this.drawingToolFunctions[drawProps.requestType].source.on(
      drawProps.listenerType,
      this.drawingToolFunctions[drawProps.requestType].callback
    );
  };

  #addSnapToDrawFunction = () => {
    if (!this.activeSnapSource) return;
    this.snapInteraction = new Snap({ source: this.activeSnapSource });
    this.map.addInteraction(this.snapInteraction);
  };

  #handleDrawCombineFeatureAddedDelayed = (e) => {
    this.#clearCombinePointsFromSource(
      this.drawingToolFunctions.combine.source
    );
    setTimeout(() => {
      this.#handleDrawCombineFeatureAdded(e);
    }, 100);
  };

  #clearCombinePointsFromSource = (source) => {
    const combineFeatures = source.getFeatures();
    const pointFeatures = combineFeatures.filter((feature) => {
      if (this.#geometryIsAPoint(feature.getGeometry())) return feature;
      return false;
    });
    pointFeatures.forEach((pointFeature) => {
      source.removeFeature(pointFeature);
    });
  };

  #geometryIsAPoint = (geometry) => {
    if (geometry.flatCoordinates.length === 2) return true;
    return false;
  };

  #handleDrawCombineFeatureAdded = (e) => {
    if (this.selectedFeatureFromMap) {
      let feature = this.selectedFeatureFromMap.clone();
      feature.selectedFromMap = true;
      this.hideItem(this.selectedFeatureFromMap);

      const featureCollection = {
        searchType: "SelectFromMap",
        featureCollection: { features: [feature] },
        transformation: null,
        type: "area",
      };
      this.#combine(featureCollection);
      return;
    }
    this.searchResponseTool = "combine";
    this.searchModelFunctions[e.target.mode](e.feature);
  };

  #handleDrawCopyFeatureAdded = (e) => {
    this.#clearSource(this.editSources.copy);
    this.searchResponseTool = "copy";
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.copy.source);
  };

  #handleDrawNewFeatureAdded = (e) => {
    this.#clearSource(this.editSources.new);
    const data = this.#createDataset(e.feature);
    const updateStatus = this.#getNewOrRemovedFeature(
      data,
      this.editSources.new
    );
    let newFeature = updateStatus.addFeature ? updateStatus.feature : null;
    this.#setGeomtryProperty(newFeature);
    this.#publishNewFeature(newFeature);
    this.#clearSource(this.drawingToolFunctions.new.source);
  };

  #setGeomtryProperty = (feature) => {
    feature.geometry = feature.getGeometry();
    feature.coordiantes = [];
    feature.coordiantes.push(feature.geometry.getCoordinates());
    feature.type = "Polygon"; // TODO: In the furture we should be able to create Milti Polygons as well
  };

  #createDataset = (feature) => {
    const coordinates = this.#extractCoordintesFromFeature(feature);
    const features = [
      {
        geometry: {
          type: "Polygon",
          coordinates: coordinates,
        },
        id: "område.0",
        geometry_name: null,
        properties: null,
        type: "Feature",
      },
    ];
    const simulatedFeatureCollection = { features: features };
    return {
      searchType: "none",
      geometryField: null,
      featureCollection: simulatedFeatureCollection,
      transformation: null,
    };
  };

  #extractCoordintesFromFeature = (feature) => {
    let pairs = [];
    for (let i = 0; i < feature.getGeometry().flatCoordinates.length; i += 2) {
      pairs.push([
        feature.getGeometry().flatCoordinates[i],
        feature.getGeometry().flatCoordinates[i + 1],
      ]);
    }
    const coordinates = [pairs];
    return coordinates;
  };

  #handleDrawSearchFeatureAdded = (e) => {
    this.searchResponseTool = "search";
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.search.source);
  };

  setFeatureStyle = (feature, style) => {
    feature.setStyle(style);
  };

  #handleWfsSearch = (data) => {
    this.searchResponseFunctions[this.searchResponseTool](data);
  };

  #addWfsSearch = (data) => {
    this.#addFeaturesToSource(this.dataSources[data.type], data);
    this.#updateList(this.dataSources[data.type], data);
    this.#zoomToFeaturenWhenKubbSearch(data);
  };

  #zoomToFeaturenWhenKubbSearch = (data) => {
    if (data.searchType !== "List") return;

    this.#zoomToSource(this.dataSources[data.type]);
    this.localObserver.publish("mf-new-mode", data.type);
  };

  #addFeaturesToSource = (source, featureCollection) => {
    const features = this.#createFeaturesFromFeatureCollection(
      featureCollection.searchType,
      featureCollection.featureCollection,
      featureCollection.transformation
    );
    this.#clearOldSearch(source, featureCollection);
    if (features.noFeaturesFound) return;
    if (features.addOrRemoveFeature) {
      this.#handlePointClickOnLayer(
        source,
        features,
        featureCollection.geometryField
      );
      return;
    }
    this.#addNoDuplicatesToSource(
      features,
      source,
      featureCollection.geometryField
    );
  };

  #clearOldSearch = (source, featureCollection) => {
    if (featureCollection.searchType === "List") this.#clearSource(source);
  };

  #handlePointClickOnLayer = (source, featureCollection, comparePropertyId) => {
    const clickedFeature = featureCollection.features[0];
    const foundFeatureInSource = this.#getFeatureInSource(
      source.getFeatures(),
      clickedFeature,
      comparePropertyId
    );
    if (foundFeatureInSource) source.removeFeature(foundFeatureInSource);
    else source.addFeature(clickedFeature);
  };

  #addNoDuplicatesToSource = (featureSet, source, comparePropertyId) => {
    const featuresInSource = source.getFeatures();
    if (featuresInSource.length === 0) {
      source.addFeatures(featureSet.features);
      return;
    }

    const featuresToAddToSource = featureSet.features.filter((feature) => {
      if (
        !this.#getFeatureInSource(featuresInSource, feature, comparePropertyId)
      )
        return feature;
      return false;
    });

    source.addFeatures(featuresToAddToSource);
  };

  #getFeatureInSource = (
    featuresInSource,
    clickedFeature,
    comparePropertyId
  ) => {
    const featuresFoundInSource = featuresInSource.filter((feature) => {
      if (comparePropertyId) {
        if (
          feature.getProperties()[comparePropertyId] ===
          clickedFeature.getProperties()[comparePropertyId]
        )
          return feature;
      } else {
        if (
          feature.getGeometry().ol_uid === clickedFeature.getGeometry().ol_uid
        )
          return feature;
      }
      return false;
    });

    if (featuresFoundInSource.length === 0) return null;
    return featuresFoundInSource[0];
  };

  #createFeaturesFromFeatureCollection = (
    selectionGeometryType,
    featureCollection,
    transformation
  ) => {
    if (featureCollection.features.length === 0)
      return { noFeaturesFound: true };

    if (featureCollection.searchType === "SelectFromMap")
      return {
        features: featureCollection.features[0],
        addOrRemoveFeature: true,
      };

    const features = featureCollection.features.map((feature) => {
      if (feature.selectedFromMap) return feature;

      let geometry = this.#createGeometry(
        feature.geometry.type,
        feature.geometry.coordinates
      );
      this.#transformGeometry(transformation, geometry);
      let newFeature = new Feature({
        geometry: geometry,
      });
      newFeature.setProperties(feature.properties);
      return newFeature;
    });

    const pointClick = selectionGeometryType === "Point";
    return { features: features, addOrRemoveFeature: pointClick };
  };

  #createGeometry = (type, coordinates) => {
    return new Transform().createGeometry(type, coordinates);
  };

  #transformGeometry = (transformation, geometry) => {
    if (!transformation) return;
    return new Transform().transformGeometry(
      geometry.clone(),
      transformation.fromSrs,
      transformation.toSrs
    );
  };

  #updateList = (source, data) => {
    const featuresAndGeometryProperyName = {
      features: source.getFeatures(),
      propertyName: data.geometryField,
      type: data.type,
    };
    this.localObserver.publish(
      "mf-wfs-map-updated-features",
      featuresAndGeometryProperyName
    );
  };

  #zoomToSource = (source) => {
    const featuresInSource = source.getFeatures();
    if (featuresInSource.length === 0) return;

    let extent = createEmpty();
    featuresInSource.forEach((feature) => {
      extend(extent, feature.getGeometry().getExtent());
    });
    this.map.getView().fit(extent, {
      size: this.map.getSize(),
      padding: [100, 100, 100, 100],
      maxZoom: 12,
    });
  };

  #combine = (data) => {
    if (!this.combinedGeometries) this.combinedGeometries = [];
    const updateStatus = this.#getNewOrRemovedFeature(
      data,
      this.editSources.combine
    );

    if (!this.combineFeature) {
      this.combineFeature = updateStatus.feature;
      return;
    }

    this.#combineFeature(updateStatus);
    this.combineFeature = this.editSources.combine.getFeatures()[0];
    this.#publishNewFeature(this.combineFeature);
    this.localObserver.publish("mf-geometry-selected-from-map", null);
  };

  #combineFeature = (updateStatus) => {
    const combinedGeometry = this.combineFunctions[this.combineMethod](
      this.combineFeature,
      updateStatus.feature
    );
    const featureCollection = {
      searchType: "CombinePolygons",
      featureCollection: { features: [combinedGeometry] },
      transformation: null,
    };
    this.#clearSource(this.editSources.combine);
    this.#addFeaturesToSource(this.editSources.combine, featureCollection);
  };

  #getTurfPolygon = (feature) => {
    const coordiantes = this.#extractCoordintesFromFeature(feature);
    return polygon(coordiantes);
  };

  #combineUnion = (feature1, feature2) => {
    return union(
      this.#getTurfPolygon(feature1),
      this.#getTurfPolygon(feature2)
    );
  };

  #combineDifference = (feature1, feature2) => {
    return difference(
      this.#getTurfPolygon(feature1),
      this.#getTurfPolygon(feature2)
    );
  };

  #combineIntersect = (feature1, feature2) => {
    return intersect(
      this.#getTurfPolygon(feature1),
      this.#getTurfPolygon(feature2)
    );
  };

  #updateCombineArray = (data) => {
    if (!this.combineChildren) this.combineChildren = [];

    data.featureCollection.features.forEach((feature) => {
      const childId = feature.properties[data.geometryField];
      if (childId === this.combineParent) return;

      let alreadyExists = false;
      this.combineChildren.forEach((child) => {
        if (child.Id === childId) alreadyExists = true;
      });

      if (alreadyExists) {
        this.combineChildren.forEach((child) => {
          if (child.Id === childId) child.parentsId.push(this.combineParent);
        });
      }

      if (!alreadyExists)
        this.combineChildren.push({
          Id: childId,
          parentsId: [this.combineParent],
        });
    });
  };

  #copyWfsSearch = (data) => {
    this.#clearSource(this.editSources.copy);
    const updateStatus = this.#getNewOrRemovedFeature(
      data,
      this.editSources.copy
    );
    const newFeature = updateStatus.addFeature ? updateStatus.feature : null;
    this.#publishNewFeature(newFeature);
  };

  #getNewOrRemovedFeature = (data, source) => {
    const previousFeatures = source.getFeatures();
    this.#addFeaturesToSource(source, data);
    const presentFeatures = source.getFeatures();
    if (previousFeatures.length > presentFeatures)
      return {
        feature: previousFeatures[0],
        addFeature: false,
        removeFeature: true,
        previousFeatures: previousFeatures,
        presentFeatures: presentFeatures,
      };

    const newFeature = presentFeatures.filter((feature) => {
      return previousFeatures.indexOf(feature) === -1;
    })[0];

    return {
      feature: newFeature,
      addFeature: true,
      removeFeature: false,
      previousFeatures: previousFeatures,
      presentFeatures: presentFeatures,
    };
  };

  #publishNewFeature = (newFeature) => {
    this.localObserver.publish("mf-new-feature-pending", newFeature);
  };

  #snapWfsSearch = (data) => {
    const features = this.#createFeaturesFromFeatureCollection(
      data.searchType,
      data.featureCollection,
      data.transformation
    );
    this.#addNoDuplicatesToSource(
      features,
      this.activeSnapSource,
      data.geometryField
    );
  };

  #abortCombineTool = () => {
    this.#clearSource(this.editSources.combine);
  };

  #abortCopyTool = () => {
    this.#clearSource(this.editSources.copy);
  };

  #abortNewTool = () => {
    this.#clearSource(this.editSources.new);
  };

  #modeChanged = (mode) => {
    this.#clearSource(this.highlightSource);
    this.#hideAllLayers();
    this.#showActiveLayer(mode);
    this.#setActiveSource(mode);
    this.#setActiveNewSource(mode);
    this.#zoomToSource(this.dataSources[mode]);

    // Adding this line of code here due to a bug with the interactions adds an extra time.
    this.#addMapSelection();
  };

  #hideAllLayers = () => {
    for (const layer of this.dataLayers.array) layer.setVisible(false);
    for (const layer of this.newLayers.array) layer.setVisible(false);

    this.#hideLayers(this.dataLayers.array);
    this.#hideLayers(this.newLayers.array);
  };

  #hideLayers = (mapLayersArray) => {
    for (const layer of mapLayersArray) layer.setVisible(false);
  };

  #showActiveLayer = (mode) => {
    this.dataLayers[mode].setVisible(true);
    this.newLayers[mode]?.setVisible(true);
  };

  #setActiveSource = (mode) => {
    this.activeSource = this.dataSources[mode];
  };

  #setActiveNewSource = (mode) => {
    this.activeNewSource = this.newSources[mode];
  };

  #highlightItem = (item) => {
    if (item.selectedFromMap) {
      let featureId = item.feature.ol_uid;
      this.listItemRefs[featureId].current.scrollIntoView();
    }

    const addItem = !this.#isFeatureHighlighted(item.feature);
    this.#clearSource(this.highlightSource);

    if (addItem) {
      this.highlightSource.addFeature(item.feature);
      this.selectedFeatureFromMap = item.feature;
    } else this.selectedFeatureFromMap = null;
  };

  #isFeatureHighlighted = (feature) => {
    return this.highlightSource.getFeatures()[0] === feature;
  };

  hideItem = (item) => {
    this.localObserver.publish("mf-geometry-hide-from-map", item);
  };

  handleWindowOpen = () => {
    this.localObserver.publish("window-opened");
  };

  handleWindowClose = () => {
    this.localObserver.publish("mf-window-closed");
  };

  #sendSnackbarMessage = (nativeMessageType) => {
    this.localObserver.publish("mf-kubb-message-received", nativeMessageType);
  };

  initEdpConnection = () => {
    var address = this.#getKubbAddress();
    var path = this.#getKubbPath();
    var query = this.#getKubbQuery();

    const url = address + path + query;
    const connection = new HubConnectionBuilder().withUrl(url).build();

    connection.on(
      "HandleRealEstateIdentifiers",
      this.#receiveRealEstatesFromKubb
    );
    connection.on("HandleAskingForRealEstateIdentifiers", () => {
      this.#sendRealEstatesToKubb(connection);
    });

    connection.on("HandleCoordinates", this.#receiveCoordinatesFromKubb);
    connection.on("HandleAskingForCoordinates", () => {
      this.#sendCoordinatesToKubb(connection);
    });

    connection.on("HandleAskingForFeatures", (featureInfos) => {
      if (!featureInfos || featureInfos.length === 0 || !featureInfos[0].type) {
        return console.warn(
          `'HandleAskingForFeatures' was invoked with missing parameters...`
        );
      }
      try {
        const idList = featureInfos.map((fi) => fi.id) || [];
        this.kubbHandleFeatureFunctions[featureInfos[0].type](idList);
      } catch (error) {
        console.error(
          `KubbX: Error while handling 'HandleAskingForFeatures'. Error: ${error}`
        );
      }
    });

    connection.on("HandleAskingForFeatureGeometry", (geometryInfo) => {
      if (!geometryInfo || !geometryInfo.id) {
        return console.warn(
          `'HandleAskingForFeatureGeometry' was invoked with missing id...`
        );
      }
      try {
        this.kubbGeometryId = geometryInfo.id;
        this.#sendGeometryToKubb();
      } catch (error) {
        console.error(
          `KubbX: Error while handling 'HandleAskingForFeatureGeometry'. Error: ${error}`
        );
      }
    });

    connection.on("HandleOperationFeedback", (feedback) => {
      this.#feedbackSendGeometryToKubb(feedback);
    });

    connection
      .start()
      .then(() => this.#kubbConnectionEstablished())
      .catch((err) => this.#failKubbConnection(err));
  };

  #getKubbAddress = () => {
    return this.options.kubbAddress;
  };

  #getKubbPath = () => {
    if (this.options.kubbPathEndpoint.charAt(0) === "/")
      return this.options.kubbPathEndpoint;
    return "/" + this.options.kubbPathEndpoint;
  };

  #getKubbQuery = () => {
    let userName = "";

    // If there are no userDetails, check if there is a test userName.
    if (this.options.test_kubbUserName) {
      userName = this.options.test_kubbUserName;
    }

    // Use the userDetails provided back to the client from the AD lookup.
    // You cannot use the entire user-details-object... It contains several properties and
    // *is never* a string. Added 'sAMAccountName' /@Hallbergs.
    if (this.app.config.userDetails) {
      userName = this.app.config.userDetails.sAMAccountName;
    }

    // If we have no user, warn that we are creating a Kubb connectio with no user.
    if (!userName) {
      console.warn("Empty userName provided to Kubb Connection");
    }

    console.log("userName to Kubb:", userName);
    const organisation = this.options.kubbOrganisationId;
    return `?user=${userName}&organisation=${organisation}&clientType=External&client=webmapapp`;
  };

  #kubbConnectionEstablished = () => {
    this.localObserver.publish("mf-kubb-connection-established");
  };

  #failKubbConnection = (err) => {
    console.error(err.toString());
    this.localObserver.publish("mf-kubb-connection-rejected");
  };

  #receiveRealEstatesFromKubb = (realEstateIdentifiers) => {
    this.#sendSnackbarMessage({
      nativeType: "fastigheter",
      nativeKind: "receive",
    });
    console.log("Tar emot fastigheter från KubbX", realEstateIdentifiers);
    const FNRs = realEstateIdentifiers.map((realEstate) => {
      return realEstate.fnr;
    });
    this.searchResponseTool = "search";
    this.searchModel.findRealEstatesWithNumbers(FNRs);
  };

  #sendRealEstatesToKubb = (connection) => {
    this.#sendSnackbarMessage({
      nativeType: "fastigheter",
      nativeKind: "send",
    });
    console.log("Skickar fastigheter till KubbX", this.kubbData["realEstate"]);
    connection.invoke("SendRealEstateIdentifiers", this.kubbData["realEstate"]);
  };

  #receiveCoordinatesFromKubb = (coordinates) => {
    this.#sendSnackbarMessage({
      nativeType: "koordinater",
      nativeKind: "receive",
    });
    console.log("Tar emot koordinater från KubbX", coordinates);
    const coordinateList = coordinates.map((coordinate) => {
      return {
        northing: String(coordinate.northing),
        easting: String(coordinate.easting),
        spatialReferenceSystemIdentifier:
          coordinate.spatialReferenceSystemIdentifier,
        label: coordinate.label,
      };
    });
    this.searchResponseTool = "search";
    this.searchModel.findCoordinatesWithCoordinates(coordinateList);
  };

  #sendCoordinatesToKubb = (connection) => {
    this.#sendSnackbarMessage({
      nativeType: "koordinater",
      nativeKind: "send",
    });
    console.log("Skickar koordinater till KubbX", this.kubbData["coordinate"]);
    connection.invoke("SendCoordinates", this.kubbData["coordinate"]);
  };

  #receiveAreasFromKubb = (areaIdentifiers) => {
    this.#sendSnackbarMessage({
      nativeType: "områden",
      nativeKind: "receive",
    });
    console.log("Tar emot områden från KubbX", areaIdentifiers);
    this.searchResponseTool = "search";
    this.searchModel.findAreasWithNumbers(areaIdentifiers);
  };

  #sendAreasToKubb = (connection) => {
    this.#sendSnackbarMessage({
      nativeType: "områden",
      nativeKind: "send",
    });
    console.log("Områdesdata till KubbX", this.kubbData["area"]);
    const kubbData = this.kubbData["area"].map((area) => {
      return { id: "" + area.id, type: 1 };
    });
    console.log("Skickar områden till KubbX", kubbData);
    connection.invoke("SendFeatures", kubbData);
  };

  #receiveSurveysFromKubb = (surveyIdentifiers) => {
    this.#sendSnackbarMessage({
      nativeType: "undersökningar",
      nativeKind: "receive",
    });
    console.log("Tar emot undersökningar från KubbX", surveyIdentifiers);
    this.searchResponseTool = "search";
    this.searchModel.findAreasWithNumbers(surveyIdentifiers);
  };

  #sendSurveysToKubb = (connection) => {
    this.#sendSnackbarMessage({
      nativeType: "undersökningar",
      nativeKind: "send",
    });
    console.log("Undersökningsdata till KubbX", this.kubbData["area"]);
    const kubbData = this.kubbData["area"].map((survey) => {
      return { id: "" + survey.id, type: 2 };
    });
    console.log("Skickar undersökningar till KubbX", kubbData);
    connection.invoke("SendFeatures", kubbData);
  };

  #receiveContaminationsFromKubb = (contaminationIdentifiers) => {
    this.#sendSnackbarMessage({
      nativeType: "föroreningar",
      nativeKind: "receive",
    });
    console.log("Tar emot föroreningar från KubbX", contaminationIdentifiers);
    this.searchResponseTool = "search";
    this.searchModel.findAreasWithNumbers(contaminationIdentifiers);
  };

  #sendContaminationsToKubb = (connection) => {
    this.#sendSnackbarMessage({
      nativeType: "föroreningar",
      nativeKind: "send",
    });
    console.log("Föroreningsdata till KubbX", this.kubbData["contamination"]);
    const kubbData = this.kubbData["contamination"].map((contamination) => {
      return { id: "" + contamination.id, type: 3 };
    });
    console.log("Skickar undersökningar till KubbX", kubbData);
    connection.invoke("SendFeatures", kubbData);
  };

  #sendGeometryToKubb = (connection) => {
    if (this.kubbUppdateFeatures.features.length === 0) {
      this.localObserver.publish("mf-kubb-geometry-message-error");
      return;
    }
    this.#sendSnackbarMessage({
      nativeType: "geometri",
      nativeKind: "send",
    });
    this.kubbPendingFeature = this.kubbUppdateFeatures.features.pop();
    const updatedGeometry = {
      srsId: 3007,
      wkt: new WKT().writeFeature(this.kubbPendingFeature),
    };
    console.log("Skickar geometrin till KubbX", updatedGeometry);
    connection.invoke("SendGeometry", updatedGeometry);
  };

  #feedbackSendGeometryToKubb = (feedback) => {
    console.log("Geometriåterkoppling från Vision", feedback);
    if (!feedback.Success) {
      this.localObserver.publish("mf-kubb-geometry-update-error");
      return;
    }

    console.log("Återkoppling sker mot kartobjekt ", this.kubbSendType);
    console.log("Återkoppling sker mot geometri ", this.kubbGeometryId);
    this.kubbFeedbackFunctions[this.kubbSendType]([this.kubbGeometryId]);
    this.localObserver.publish(
      "mf-kubb-geometry-update-success",
      feedback.Text
    );
  };

  updateKubbWithData = (data, type) => {
    this.kubbSendType = type;
    this.kubbData[type] = data.map((feature) => {
      return this.kubbDataFunctions[type](feature);
    });
  };

  updateKubbWithGeometry = (feature) => {
    this.kubbUppdateFeatures = feature;
  };

  #updateKubbWithRealEstate = (feature) => {
    return {
      Fnr: feature.fnr,
      Name: feature.name,
      Municipality: "Göteborg",
      Uuid: "909a6a64-5c59-90ec-e040-ed8f66444c3f",
    };
  };

  #updateKubbWithCoordinates = (feature) => {
    return {
      northing: feature.feature.getGeometry().flatCoordinates[1],
      easting: feature.feature.getGeometry().flatCoordinates[0],
      spatialReferenceSystemIdentifier: "3007",
    };
  };

  #updateKubbWithAreas = (feature) => {
    return {
      id: feature.name,
      type: 1,
    };
  };

  #updateKubbWithSurveys = (feature) => {
    return {
      id: feature.name,
      type: 2,
    };
  };

  #updateKubbWithContaminations = (feature) => {
    return {
      id: feature.name,
      type: 3,
    };
  };
}

export default IntegrationModel;
