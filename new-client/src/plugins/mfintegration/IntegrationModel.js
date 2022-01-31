import { click } from "ol/events/condition";
import { createMapStyles } from "./MapStyles";
import Draw from "ol/interaction/Draw";
import { extend, createEmpty } from "ol/extent";
import Feature from "ol/Feature";
import { Fill, Stroke, Style, Circle } from "ol/style";
import Point from "ol/geom/Point";
import Select from "ol/interaction/Select";
import Snap from "ol/interaction/Snap";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Transform from "./Transformation/Transform";
import { KUBB } from "./mockdata/mockdataKUBB";

class IntegrationModel {
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.options = settings.options;
    this.localObserver = settings.localObserver;
    this.searchModel = settings.searchModel;

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
    this.localObserver.subscribe("mf-wfs-search", (data) => {
      this.#handleWfsSearch(data);
    });
    this.localObserver.subscribe("mf-new-mode", (mode) => {
      this.#modeChanged(mode);
    });
    this.localObserver.subscribe("mf-item-list-clicked", (clickedItem) => {
      this.#highlightItem(clickedItem);
    });
  };

  #init = () => {
    this.handleWindowOpen();
    this.mapStyles = createMapStyles(this.options);
    this.wmsConfig = this.#createWmsConfig(this.options);
    this.#initSearchModelFunctions();
    this.#initSearchResponseFunctions();
    this.#initDrawingFunctions();
    this.#addLayers();
    this.#initActiveSource();
    this.addMapSelection();
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
      copy: this.#copyWfsSearch,
      search: this.#addWfsSearch,
      snap: this.#snapWfsSearch,
    };
  };

  #initDrawingFunctions = () => {
    this.drawingToolFunctions = {
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
    this.removeMapSelect();
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Point", this.mapStyles.drawSearchStyle);
  };

  startDrawSearchPolygon = (mode) => {
    this.removeMapSelect();
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

  addMapSelection = () => {
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

  removeMapSelect = () => {
    this.map.removeInteraction(this.selectInteraction);
  };

  clearInteractions = () => {
    this.endDraw();
    this.endSnapInteraction();
  };

  endDraw = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete(this.drawingTool);
    this.drawingTool = "none";
    this.map.addInteraction(this.selectInteraction);
  };

  endDrawCopy = () => {
    this.map.clickLock.delete("copy");
    this.endDraw();
  };

  endDrawNew = () => {
    this.map.clickLock.delete("new");
    this.endDraw();
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
    this.#clearSource(this.editSources[editMode]);
  };

  toggleFeatureStyleVisibility = (feature, shouldBeVisible) => {
    let featureStyle = new Style();
    if (shouldBeVisible) featureStyle = null;

    this.#setFeatureStyle(feature, featureStyle);
  };

  deleteNewGeometry = (featureCollection, source) => {
    featureCollection.features.forEach((feature) => {
      this.editSources[source].removeFeature(feature);
    });
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

  // TODO: Ev. ta bort denna funktion om admin ger ett sådant här objekt (finns i mockdata)
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

  #handleDrawCopyFeatureAdded = (e) => {
    this.#clearSource(this.editSources.copy);
    this.searchResponseTool = "copy";
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.new.source);
  };

  #handleDrawNewFeatureAdded = (e) => {
    this.#clearSource(this.editSources.new);
    const data = this.#createDataset(e.feature);
    // TODO: I krav 3.6 kan även snap betyde källa combine
    this.#addAndPublishNewFeature(data, this.editSources.new);
    this.#clearSource(this.drawingToolFunctions.new.source);
  };

  #createDataset = (feature) => {
    let pairs = [];
    for (let i = 0; i < feature.getGeometry().flatCoordinates.length; i += 2) {
      pairs.push([
        feature.getGeometry().flatCoordinates[i],
        feature.getGeometry().flatCoordinates[i + 1],
      ]);
    }
    const coordinates = [pairs];
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

  #handleDrawSearchFeatureAdded = (e) => {
    this.searchResponseTool = "search";
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.search.source);
  };

  #setFeatureStyle = (feature, style) => {
    feature.setStyle(style);
  };

  #handleWfsSearch = (data) => {
    this.searchResponseFunctions[this.searchResponseTool](data);
  };

  #addWfsSearch = (data) => {
    this.#addFeaturesToSource(this.dataSources[data.type], data);
    this.#updateList(this.dataSources[data.type], data);
    this.#zoomToSource(this.dataSources[data.type]);
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
      if (
        feature.getProperties()[comparePropertyId] ===
        clickedFeature.getProperties()[comparePropertyId]
      )
        return feature;
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

    const features = featureCollection.features.map((feature) => {
      let geometry = new Transform().createGeometry(
        feature.geometry.type,
        feature.geometry.coordinates
      );
      if (transformation)
        geometry = new Transform().transformGeometry(
          geometry.clone(),
          transformation.fromSrs,
          transformation.toSrs
        );
      let newFeature = new Feature({
        geometry: geometry,
      });
      newFeature.setProperties(feature.properties);
      return newFeature;
    });

    const pointClick = selectionGeometryType === "Point";
    return { features: features, addOrRemoveFeature: pointClick };
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

  #copyWfsSearch = (data) => {
    // TODO: I krav 3.6 kan även snap betyde källa combine
    this.#clearSource(this.editSources.copy);
    this.#addAndPublishNewFeature(data, this.editSources.copy);
  };

  #addAndPublishNewFeature = (data, source) => {
    const previousFeatures = source.getFeatures();
    this.#addFeaturesToSource(source, data);
    const presentFeatures = source.getFeatures();

    const newFeature = presentFeatures
      .filter((feature) => {
        return previousFeatures.indexOf(feature) === -1;
      })
      .shift();
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

  #modeChanged = (mode) => {
    this.#clearSource(this.highlightSource);
    this.#hideAllLayers();
    this.#showAcitveLayer(mode);
    this.#setActiveSource(mode);
    this.#setActiveNewSource(mode);
    this.#zoomToSource(this.dataSources[mode]);
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

  #showAcitveLayer = (mode) => {
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

  handleWindowOpen = () => {
    this.localObserver.publish("window-opened");
  };

  handleWindowClose = () => {
    this.localObserver.publish("mf-window-closed");
  };

  #sendSnackbarMessage = (nativMessageType) => {
    //TODO - when Kubb is properly connected, we will do some kind of parsing of the message, to find out the type.
    //as it is not the message, is a basic mock.
    this.localObserver.publish("mf-kubb-message-received", nativMessageType);
  };

  testRealEstatesFromKUBB = () => {
    this.#sendSnackbarMessage("fastighter");
    const FNRs = KUBB().realEstates;
    this.searchResponseTool = "search";
    this.searchModel.findRealEstatesWithNumbers(FNRs);
  };

  testCoordinatesFromKUBB = () => {
    this.#sendSnackbarMessage("koordinater");
    const coordinates = KUBB().coordinates;
    this.searchResponseTool = "search";
    this.searchModel.findCoordinatesWithCoordinates(coordinates);
  };

  testAreasFromKUBB = () => {
    this.#sendSnackbarMessage("områden");
    this.searchResponseTool = "search";
    this.searchModel.findAreasWithNumbers({
      coordinates: KUBB().areas.coordinates,
      name: KUBB().areas.name,
    });
  };

  testSurveysFromKUBB = () => {
    this.#sendSnackbarMessage("undersökningar");
    const surveys = KUBB().surveys;
    this.searchResponseTool = "search";
    this.searchModel.findSurveysWithNumbers(surveys);
  };

  testContaminationsFromKUBB = () => {
    this.#sendSnackbarMessage("föroreningar");
    const contaminations = KUBB().contaminations;
    this.searchResponseTool = "search";
    this.searchModel.findContaminationsWithNumbers(contaminations);
  };
}

export default IntegrationModel;
