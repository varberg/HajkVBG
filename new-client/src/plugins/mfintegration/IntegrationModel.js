import { Fill, Stroke, Style, Circle } from "ol/style";
import { extend, createEmpty } from "ol/extent";
import Draw from "ol/interaction/Draw";
import Feature from "ol/Feature";
import Transform from "./Transformation/Transform";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { KUBB } from "./mockdata/mockdataKUBB";
import {
  searchStyle,
  highLightStyle,
  layerStyle,
  newGeometryStyle,
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
      this.#addFeaturesToSource(this.sources[data.type], data);
      this.#updateList(this.sources[data.type], data);
      this.#zoomToSource(this.sources[data.type]);
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

  #initDrawingFunctions = () => {
    this.drawingFunctions = {
      new: {
        drawCallback: this.#handleDrawNewFeatureAdded,
        source: this.#createNewVectorSource(),
      },
      search: {
        drawCallback: this.#handleDrawSearchFeatureAdded,
        source: this.#createNewVectorSource(),
      },
    };
  };

  startDrawSearchPoint = (mode) => {
    this.drawingFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Point", searchStyle());
  };

  startDrawSearchPolygon = (mode) => {
    this.drawingFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Polygon", searchStyle());
  };

  endDrawSearch = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete("search");
  };

  startDrawNewPoint = (mode) => {
    this.drawingFunctions.new.source.mode = mode;
    // TODO:
    // his.#drawGeometry("new", "Point");
  };

  startDrawNewPolygon = (mode) => {
    this.drawingFunctions.new.source.mode = mode;
    // TODO:
    // his.#drawGeometry("new", "Polygon");
  };

  endDrawNew = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete("new");
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
    this.#addDataLayers();
    this.#addHighlightLayer();
  };

  #addSearchLayer = () => {
    const searchLayer = this.#createNewVectorLayer(
      this.drawingFunctions.search.source,
      this.#createLayerStyle(searchStyle())
    );
    this.map.addLayer(searchLayer);
  };

  #addNewGeometryLayer = () => {
    const newGeometryLayer = this.#createNewVectorLayer(
      this.drawingFunctions.new.source,
      this.#createLayerStyle(newGeometryStyle())
    );
    this.map.addLayer(newGeometryLayer);
  };

  #addDataLayers = () => {
    this.#addSources();
    this.#addActiveSource();

    this.layers = {
      realEstate: this.#createNewVectorLayer(
        this.sources.realEstate,
        this.#createLayerStyle(layerStyle())
      ),
      coordinate: this.#createNewVectorLayer(
        this.sources.coordinate,
        this.#createLayerStyle(layerStyle())
      ),
      area: this.#createNewVectorLayer(this.sources.area, layerStyle),
      survey: this.#createNewVectorLayer(this.sources.survey, layerStyle),
      contamination: this.#createNewVectorLayer(
        this.sources.contamination,
        layerStyle
      ),
    };
    this.layers.array = [
      this.layers.realEstate,
      this.layers.coordinate,
      this.layers.area,
      this.layers.survey,
      this.layers.contamination,
    ];
    for (const layer of this.layers.array) this.map.addLayer(layer);
  };

  #addSources = () => {
    this.sources = {
      realEstate: this.#createNewVectorSource(),
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };
  };

  #addActiveSource = () => {
    this.activeSource = this.sources[0];
  };

  #addHighlightLayer = () => {
    this.highlightSource = this.#createNewVectorSource();

    this.highlightLayer = this.#createNewVectorLayer(
      this.highlightSource,
      this.#createLayerStyle(highLightStyle())
    );
    this.map.addLayer(this.highlightLayer);
  };

  #drawGeometry = (requestType, drawType, style) => {
    const drawFunctionProps = {
      listenerType: "addfeature",
      requestType: requestType,
      style: this.#createLayerStyle(style),
      source: this.drawingFunctions[requestType].source,
      type: drawType,
    };
    this.#createDrawFunction(drawFunctionProps);
  };

  #createDrawFunction = (props) => {
    this.drawInteraction = new Draw({
      source: props.source,
      type: props.type,
      freehand: false,
      stopClick: true,
      style: props.style,
    });
    this.map.clickLock.add(props.requestType);
    this.map.addInteraction(this.drawInteraction);
    this.drawingFunctions.search.source.on(
      props.listenerType,
      this.drawingFunctions[props.requestType].drawCallback
    );
  };

  #handleDrawSearchFeatureAdded = (e) => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete("search");
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingFunctions.search.source);
  };

  #handleDrawNewFeatureAdded = (e) => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete("new");
    // TODO:
    // Lägg till geometri till källan.
    // Rensa rita-ny-källan.
  };

  #setFeatureStyle = (feature, style) => {
    feature.setStyle(style);
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
    this.searchModel.findRealEstatesWithNumbers(FNRs);
  };

  testCoordinatesFromKUBB = () => {
    this.#sendSnackbarMessage("koordinater");
    const coordinates = KUBB().coordinates;
    this.searchModel.findCoordinatesWithCoordinates(coordinates);
  };

  testAreasFromKUBB = () => {
    this.#sendSnackbarMessage("områden");
    // Lindholmen 27:1
    this.searchModel.findAreasWithNumbers({
      coordinates: KUBB().areas.coordinates,
      name: KUBB().areas.name,
    });
  };

  testSurveysFromKUBB = () => {
    this.#sendSnackbarMessage("undersökningar");
    const surveys = KUBB().surveys;
    this.searchModel.findSurveysWithNumbers(surveys);
  };

  testContaminationsFromKUBB = () => {
    this.#sendSnackbarMessage("föroreningar");
    const contaminations = KUBB().contaminations;
    this.searchModel.findContaminationsWithNumbers(contaminations);
  };
}

export default IntegrationModel;
