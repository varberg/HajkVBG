import { Fill, Stroke, Style, Circle } from "ol/style";
import { extend, createEmpty } from "ol/extent";
import Draw from "ol/interaction/Draw";
import Feature from "ol/Feature";
import Transform from "./Transformation/Transform";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { KUBB } from "./mockdata/mockdataKUBB";
import {
  drawStyle,
  highLightStyle,
  layerStyle,
} from "./mockdata/mockdataStyle";

class IntegrationModel {
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.options = settings.options;
    this.localObserver = settings.localObserver;
    this.searchModel = settings.searchModel;

    this.#initMapLayers();
    this.#initActiveSource();
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

  #initMapLayers = () => {
    this.handleWindowOpen();
    this.#addDrawPointPolygonLayer();
    this.#addLayers();
    this.#addHighlightLayer();
  };

  #initActiveSource = () => {
    this.activeSource = this.sources[0];
  };

  drawPolygon = () => {
    this.#drawRealEstatePolygon();
  };

  drawPoint = () => {
    this.#drawRealEstatePoint();
  };

  clearResultsRealEstate = () => {
    this.#clearSource(this.realEstateSource);
  };

  clearResultsCoordinate = () => {
    this.#clearSource(this.coordinateSource);
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

  #drawRealEstatePolygon = () => {
    const drawFunctionProps = {
      listenerText: "addfeature",
      requestText: "search",
      style: this.#getDrawPointPolygonStyle(),
      source: this.drawSourcePointPolygon,
      type: "Polygon",
    };
    this.#createDrawFunction(drawFunctionProps);
  };

  #drawRealEstatePoint = () => {
    const drawFunctionProps = {
      listenerText: "addfeature",
      requestText: "search",
      style: this.#getDrawPointPolygonStyle(),
      source: this.drawSourcePointPolygon,
      type: "Point",
    };
    this.#createDrawFunction(drawFunctionProps);
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

  #createNewVectorCircleStyle = (style) => {
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

  #addDrawPointPolygonLayer = () => {
    const stylePointPolygon = this.#getDrawPointPolygonStyle();
    this.drawSourcePointPolygon =
      this.#createNewVectorSource(stylePointPolygon);

    const drawPointPolygonLayer = this.#createNewVectorLayer(
      this.drawSourcePointPolygon,
      stylePointPolygon
    );
    this.map.addLayer(drawPointPolygonLayer);
  };

  #getDrawPointPolygonStyle = () => {
    const drawPolygonStyleSettings = drawStyle();
    return this.#createNewVectorCircleStyle(drawPolygonStyleSettings);
  };

  #addLayers = () => {
    this.sources = {
      realEstate: this.#createNewVectorSource(),
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };

    const layerStyle = this.#getLayerStyle();
    this.mapLayers = {
      realEstate: this.#createNewVectorLayer(
        this.sources.realEstate,
        layerStyle
      ),
      coordinate: this.#createNewVectorLayer(
        this.sources.coordinate,
        layerStyle
      ),
      area: this.#createNewVectorLayer(this.sources.area, layerStyle),
      survey: this.#createNewVectorLayer(this.sources.survey, layerStyle),
      contamination: this.#createNewVectorLayer(
        this.sources.contamination,
        layerStyle
      ),
    };

    this.allMapLayers = [
      this.mapLayers.realEstate,
      this.mapLayers.coordinate,
      this.mapLayers.area,
      this.mapLayers.survey,
      this.mapLayers.contamination,
    ];

    this.allMapLayers.forEach((mapLayer) => {
      this.map.addLayer(mapLayer);
      return false;
    });
  };

  #addHighlightLayer = () => {
    const styleHighlight = this.#getHighlightStyle();
    this.highlightSource = this.#createNewVectorSource();

    this.highlightLayer = this.#createNewVectorLayer(
      this.highlightSource,
      styleHighlight
    );
    this.map.addLayer(this.highlightLayer);
  };

  #getLayerStyle = () => {
    const styleSettings = layerStyle();
    return this.#createNewVectorCircleStyle(styleSettings);
  };

  #getHighlightStyle = () => {
    const hightlightStyleSettings = highLightStyle();
    return this.#createNewVectorCircleStyle(hightlightStyleSettings);
  };

  #createDrawFunction = (props) => {
    this.draw = new Draw({
      source: props.source,
      type: props.type,
      freehand: false,
      stopClick: true,
      style: props.style,
    });
    this.map.clickLock.add(props.requestText);
    this.map.addInteraction(this.draw);
    this.drawSourcePointPolygon.on(
      props.listenerText,
      this.#handleDrawFeatureAdded
    );
  };

  #handleDrawFeatureAdded = (e) => {
    this.map.removeInteraction(this.draw);
    this.map.clickLock.delete("search");
    this.searchModel.findRealEstatesWithGeometry(e.feature);
    this.#clearSource(this.drawSourcePointPolygon);
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

  #modeChanged = (mode) => {
    this.#clearSource(this.highlightSource);
    this.#hideAllLayers();
    this.#showAcitveMapLayer(mode);
    this.#setActiveSource(mode);
  };

  #hideAllLayers = () => {
    this.allMapLayers.forEach((layer) => {
      layer.setVisible(false);
    });
  };

  #showAcitveMapLayer = (mode) => {
    this.mapLayers[mode].setVisible(true);
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
  };

  testContaminationsFromKUBB = () => {
    this.#sendSnackbarMessage("föroreningar");
  };
}

export default IntegrationModel;
