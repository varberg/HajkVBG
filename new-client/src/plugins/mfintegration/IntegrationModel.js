import Draw from "ol/interaction/Draw";
import Feature from "ol/Feature";
import { extend, createEmpty } from "ol/extent";
import { Fill, Stroke, Style, Circle } from "ol/style";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { KUBB } from "./mockdata/mockdataKUBB";
import Transform from "./Transformation/Transform";
import {
  drawNewStyle,
  highLightStyle,
  layerStyle,
  newGeometryStyle,
  searchStyle,
} from "./mockdata/mockdataStyle";

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
    this.#initSearchModelFunctions();
    this.#initSearchResponseFunctions();
    this.#initDrawingFunctions();
    this.#addLayers();
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
    this.#drawGeometry("copy", "Point", drawNewStyle());
  };

  startDrawNewPoint = (mode) => {
    this.drawingToolFunctions.new.source.mode = mode;
    this.#drawGeometry("new", "Point", drawNewStyle());
  };

  startDrawNewPolygon = (mode) => {
    this.drawingToolFunctions.new.source.mode = mode;
    this.#drawGeometry("new", "Polygon", drawNewStyle());
  };

  startDrawSearchPoint = (mode) => {
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Point", searchStyle());
  };

  startDrawSearchPolygon = (mode) => {
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Polygon", searchStyle());
  };

  endDrawSearch = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete(this.drawingTool);
    this.drawingTool = "none";
  };

  endDraw = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete(this.drawingTool);
    this.drawingTool = "none";
  };

  clearResults = (mode) => {
    this.#clearSource(this.sources[mode]);
  };

  clearHighlight = () => {
    this.#clearSource(this.highlightSource);
  };

  removeItemFromActiveSource = (clickedItem) => {
    if (this.#isFeatureHighlighted(clickedItem.feature))
      this.highlightSource.removeFeature(clickedItem.feature);

    this.activeSource.removeFeature(clickedItem.feature);
    if (this.activeSource.getFeatures().length > 0)
      this.#zoomToSource(this.activeSource);
  };

  toggleFeatureStyleVisibility = (feature, shouldBeVisible) => {
    let featureStyle = new Style();
    if (shouldBeVisible) featureStyle = null;

    this.#setFeatureStyle(feature, featureStyle);
  };

  #clearSource = (source) => {
    source.clear();
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
      this.#createLayerStyle(searchStyle())
    );
    this.map.addLayer(searchLayer);
  };

  #addNewGeometryLayer = () => {
    const newGeometryLayer = this.#createNewVectorLayer(
      this.drawingToolFunctions.new.source,
      this.#createLayerStyle(newGeometryStyle())
    );
    this.map.addLayer(newGeometryLayer);
  };

  #addMapLayers = () => {
    this.#addSources();

    this.#addEditLayers();
    this.#addLayersToMap(this.editLayers.array);

    this.#addDataLayers();
    this.#addLayersToMap(this.layers.array);
  };

  #addSources = () => {
    this.editSources = {
      new: this.#createNewVectorSource(),
      copy: this.#createNewVectorSource(),
      combine: this.#createNewVectorSource(),
    };

    this.sources = {
      realEstate: this.#createNewVectorSource(),
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
        this.#createLayerStyle(newGeometryStyle())
      ),
      copy: this.#createNewVectorLayer(
        this.editSources.copy,
        this.#createLayerStyle(newGeometryStyle())
      ),
      combine: this.#createNewVectorLayer(
        this.editSources.combine,
        this.#createLayerStyle(newGeometryStyle())
      ),
    };
    this.editLayers.array = [
      this.editLayers.new,
      this.editLayers.copy,
      this.editLayers.combine,
    ];
  };

  #addDataLayers = () => {
    this.layers = {
      realEstate: this.#createNewVectorLayer(
        this.sources.realEstate,
        this.#createLayerStyle(layerStyle())
      ),
      coordinate: this.#createNewVectorLayer(
        this.sources.coordinate,
        this.#createLayerStyle(layerStyle())
      ),
      area: this.#createNewVectorLayer(
        this.sources.area,
        this.#createLayerStyle(layerStyle())
      ),
      survey: this.#createNewVectorLayer(
        this.sources.survey,
        this.#createLayerStyle(layerStyle())
      ),
      contamination: this.#createNewVectorLayer(
        this.sources.contamination,
        this.#createLayerStyle(layerStyle())
      ),
    };
    this.layers.array = [
      this.layers.realEstate,
      this.layers.coordinate,
      this.layers.area,
      this.layers.survey,
      this.layers.contamination,
    ];
  };

  #addLayersToMap = (layerArray) => {
    for (const layer of layerArray) this.map.addLayer(layer);
  };

  #addHighlightLayer = () => {
    this.highlightSource = this.#createNewVectorSource();

    this.highlightLayer = this.#createNewVectorLayer(
      this.highlightSource,
      this.#createLayerStyle(highLightStyle())
    );
    this.map.addLayer(this.highlightLayer);
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
    this.drawingToolFunctions[drawProps.requestType].source.on(
      drawProps.listenerType,
      this.drawingToolFunctions[drawProps.requestType].callback
    );
  };

  #handleDrawCopyFeatureAdded = (e) => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete("copy");
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.new.source);
  };

  #handleDrawNewFeatureAdded = (e) => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete("new");
    this.editSources.new.addFeature(e.feature);
    this.#clearSource(this.drawingToolFunctions.new.source);
  };

  #handleDrawSearchFeatureAdded = (e) => {
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.search.source);
  };

  #setFeatureStyle = (feature, style) => {
    feature.setStyle(style);
  };

  #handleWfsSearch = (data) => {
    this.searchResponseFunctions[this.drawingTool](data);
  };

  #addWfsSearch = (data) => {
    this.#addFeaturesToSource(this.sources[data.type], data);
    this.#updateList(this.sources[data.type], data);
    this.#zoomToSource(this.sources[data.type]);
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
    this.#addFeaturesToSource(this.editSources.copy, data);
  };

  #modeChanged = (mode) => {
    this.#clearSource(this.highlightSource);
    this.#hideAllLayers();
    this.#showAcitveLayer(mode);
    this.#setActiveSource(mode);
  };

  #hideAllLayers = () => {
    for (const layer of this.layers.array) layer.setVisible(false);
  };

  #showAcitveLayer = (mode) => {
    this.layers[mode].setVisible(true);
  };

  #setActiveSource = (mode) => {
    this.activeSource = this.sources[mode];
  };

  #highlightItem = (item) => {
    const addItem = !this.#isFeatureHighlighted(item.feature);
    this.#clearSource(this.highlightSource);

    if (addItem) {
      this.highlightSource.addFeature(item.feature);
      this.#zoomToSource(this.highlightSource);
      return;
    }

    this.#zoomToSource(this.activeSource);
  };

  #isFeatureHighlighted = (feature) => {
    return this.highlightSource.getFeatures()[0] === feature;
  };

  handleWindowOpen = () => {
    this.localObserver.publish("window-opened");
  };

  #sendSnackbarMessage = (nativMessageType) => {
    //TODO - when Kubb is properly connected, we will do some kind of parsing of the message, to find out the type.
    //as it is not the message, is a basic mock.
    this.localObserver.publish("mf-kubb-message-received", nativMessageType);
  };

  testRealEstatesFromKUBB = () => {
    this.#sendSnackbarMessage("fastighter");
    const FNRs = KUBB().realEstates;
    this.drawingTool = "search";
    this.searchModel.findRealEstatesWithNumbers(FNRs);
  };

  testCoordinatesFromKUBB = () => {
    this.#sendSnackbarMessage("koordinater");
    const coordinates = KUBB().coordinates;
    this.drawingTool = "search";
    this.searchModel.findCoordinatesWithCoordinates(coordinates);
  };

  testAreasFromKUBB = () => {
    this.#sendSnackbarMessage("områden");
    this.drawingTool = "search";
    this.searchModel.findAreasWithNumbers({
      coordinates: KUBB().areas.coordinates,
      name: KUBB().areas.name,
    });
  };

  testSurveysFromKUBB = () => {
    this.#sendSnackbarMessage("undersökningar");
    const surveys = KUBB().surveys;
    this.drawingTool = "search";
    this.searchModel.findSurveysWithNumbers(surveys);
  };

  testContaminationsFromKUBB = () => {
    this.#sendSnackbarMessage("föroreningar");
    const contaminations = KUBB().contaminations;
    this.drawingTool = "search";
    this.searchModel.findContaminationsWithNumbers(contaminations);
  };
}

export default IntegrationModel;
