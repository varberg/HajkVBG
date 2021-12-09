import { Fill, Stroke, Style, Circle } from "ol/style";
import { extend, createEmpty } from "ol/extent";
import Draw from "ol/interaction/Draw";
import Feature from "ol/Feature";
import Transform from "./Transformation/Transform";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";

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
    this.localObserver.subscribe("mf-wfs-search-realEstates", (realEstates) => {
      this.#drawRealEstateResponseFromWfs(realEstates);
    });
    this.localObserver.subscribe(
      "mf-wfs-search-coordinates",
      (coordindates) => {
        this.#drawCoordinateResponseFromWfs(coordindates);
      }
    );
    this.localObserver.subscribe("mf-new-mode", (mode) => {
      if (mode === "realEstate") {
        this.#modeChanged(true, false);
        this.activeSource = this.realEstateSource;
      }
      if (mode === "coordinate") {
        this.#modeChanged(false, true);
        this.activeSource = this.coordinateSource;
      }
    });
    this.localObserver.subscribe("mf-item-list-clicked", (clickedItem) => {
      this.#highlightItem(clickedItem);
    });
  };

  #initMapLayers = () => {
    this.handleWindowOpen();
    this.#addDrawPointPolygonLayer();
    this.#addRealEstateLayer();
    this.#addCoordinateLayer();
    this.#addHighlightLayer();
  };

  #initActiveSource = () => {
    this.activeSource = this.realEstateSource;
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

  clearResultsCoordintes = () => {
    this.#clearSource(this.coordinateSource);
  };

  removeItemFromActiveSource = (clicedItem) => {
    if (this.#isFeatureHighlighted(clicedItem.feature))
      this.highlightSource.removeFeature(clicedItem.feature);

    this.activeSource.removeFeature(clicedItem.feature);
    if (this.activeSource.getFeatures().length > 0)
      this.#zoomToSource(this.activeSource);
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
    const drawPolygonStyleSettings = this.#getDrawPointPolygonStyleSettings();
    return this.#createNewVectorCircleStyle(drawPolygonStyleSettings);
  };

  #getDrawPointPolygonStyleSettings = () => {
    // Lägg till inställningar här!
    const strokeColor = "rgba(74,74,74,0.5)";
    const strokeWidth = 4;
    const fillColor = "rgba(255,255,255,0.07)";
    const circleRadius = 6;
    const strokeWithCircle = 2;

    return {
      stroke: { color: strokeColor, width: strokeWidth },
      fill: { color: fillColor },
      circle: { radius: circleRadius, width: strokeWithCircle },
    };
  };

  #addRealEstateLayer = () => {
    const styleRealEstatePolygon = this.#getRealEstateStyle();
    this.realEstateSource = this.#createNewVectorSource();

    this.realEstateLayer = this.#createNewVectorLayer(
      this.realEstateSource,
      styleRealEstatePolygon
    );
    this.map.addLayer(this.realEstateLayer);
  };

  #addCoordinateLayer = () => {
    const styleCoordinatePoint = this.#getCoordinateStyle();
    this.coordinateSource = this.#createNewVectorSource();

    this.coordinateLayer = this.#createNewVectorLayer(
      this.coordinateSource,
      styleCoordinatePoint
    );
    this.map.addLayer(this.coordinateLayer);
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

  #getRealEstateStyle = () => {
    const drawRealEstateStyleSettings = this.#getRealEstateStyleSettings();
    return this.#createNewVectorCircleStyle(drawRealEstateStyleSettings);
  };

  #getRealEstateStyleSettings = () => {
    // Lägg till inställningar här!
    const strokeColor = "rgba(255,0,0,0.5)";
    const strokeWidth = 4;
    const fillColor = "rgba(0,255,0,0.07)";
    const circleRadius = 6;
    const strokeWithCircle = 2;

    return {
      stroke: { color: strokeColor, width: strokeWidth },
      fill: { color: fillColor },
      circle: { radius: circleRadius, width: strokeWithCircle },
    };
  };

  #getCoordinateStyle = () => {
    const drawCoordinateStyleSettings = this.#getCoordinateStyleSettings();
    return this.#createNewVectorCircleStyle(drawCoordinateStyleSettings);
  };

  #getCoordinateStyleSettings = () => {
    // Lägg till inställningar här!
    const strokeColor = "rgba(255,0,0,0.5)";
    const strokeWidth = 4;
    const fillColor = "rgba(0,255,0,0.07)";
    const circleRadius = 6;
    const strokeWithCircle = 4;

    return {
      stroke: { color: strokeColor, width: strokeWidth },
      fill: { color: fillColor },
      circle: { radius: circleRadius, width: strokeWithCircle },
    };
  };

  #getHighlightStyle = () => {
    const hightlightStyleSettings = this.#getHighlightStyleSettings();
    return this.#createNewVectorCircleStyle(hightlightStyleSettings);
  };

  #getHighlightStyleSettings = () => {
    // Lägg till inställningar här!
    const strokeColor = "rgba(255,0,0,0.85)";
    const strokeWidth = 4;
    const fillColor = "rgba(0,255,0,0.22)";
    const circleRadius = 6;
    const strokeWithCircle = 4;

    return {
      stroke: { color: strokeColor, width: strokeWidth },
      fill: { color: fillColor },
      circle: { radius: circleRadius, width: strokeWithCircle },
    };
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
      this.handleDrawFeatureAdded
    );
  };

  handleDrawFeatureAdded = (e) => {
    this.map.removeInteraction(this.draw);
    this.map.clickLock.delete("search");
    this.searchModel.findRealEstatesWithGeometry(e.feature);
    this.#clearSource(this.drawSourcePointPolygon);
  };

  #drawRealEstateResponseFromWfs = (realEstates) => {
    this.#addRealEstateToSource(this.realEstateSource, realEstates);
    this.#updateRealEstateList(this.realEstateSource, realEstates);
    this.#zoomToSource(this.realEstateSource);
  };

  #updateRealEstateList = (source, realEstates) => {
    const featuresAndGeometryProperyName = {
      features: source.getFeatures(),
      propertyName: realEstates.geometryField,
    };
    this.localObserver.publish(
      "mf-wfs-map-updated-features-real-estates",
      featuresAndGeometryProperyName
    );
  };

  #drawCoordinateResponseFromWfs = (coordinates) => {
    this.#addCoordinateToSource(this.coordinateSource, coordinates);
    this.#updateCoordinateList(this.coordinateSource, coordinates);
    this.#zoomToSource(this.coordinateSource);
  };

  #updateCoordinateList = (source, coordinates) => {
    const featuresAndGeometryProperyName = {
      features: source.getFeatures(),
      propertyName: coordinates.geometryField,
    };
    this.localObserver.publish(
      "mf-wfs-map-updated-features-coordinate",
      featuresAndGeometryProperyName
    );
  };

  #zoomToSource = (source) => {
    let extent = createEmpty();
    const features = source.getFeatures();
    features.forEach((feature) => {
      extend(extent, feature.getGeometry().getExtent());
    });
    this.map.getView().fit(extent, {
      size: this.map.getSize(),
      padding: [100, 100, 100, 100],
      maxZoom: 12,
    });
  };

  #addRealEstateToSource = (source, realEstates) => {
    const realEstateFeatures = this.#createFeaturesFromFeatureCollection(
      realEstates.searchType,
      realEstates.featureCollection,
      realEstates.transformation
    );
    this.#clearOldSearch(source, realEstates);
    if (realEstateFeatures.noFeaturesFound) return;
    if (realEstateFeatures.addOrRemoveFeature) {
      this.#handlePointClickOnRealEstateLayer(
        source,
        realEstateFeatures,
        realEstates.geometryField
      );
      return;
    }
    this.#addNoDuplicatesToSource(
      realEstateFeatures,
      source,
      realEstates.geometryField
    );
  };

  #addCoordinateToSource = (source, coordinates) => {
    const coordinateFeatures = this.#createFeaturesFromFeatureCollection(
      coordinates.searchType,
      coordinates.featureCollection,
      coordinates.transformation
    );
    this.#clearOldSearch(source, coordinates);
    if (coordinateFeatures.noFeaturesFound) return;
    if (coordinateFeatures.addOrRemoveFeature) {
      this.#handlePointClickOnCoordinateLayer(
        source,
        coordinateFeatures,
        coordinates.geometryField
      );
      return;
    }
    this.#addNoDuplicatesToSource(
      coordinateFeatures,
      source,
      coordinates.geometryField
    );
  };

  #clearOldSearch = (source, featureCollection) => {
    if (featureCollection.searchType === "List") this.#clearSource(source);
  };

  #handlePointClickOnRealEstateLayer = (
    source,
    realEstateFeatures,
    comparePropertyId
  ) => {
    const clickedFeature = realEstateFeatures.features[0];
    const foundFeatureInSource = this.#getFeatureInSource(
      source.getFeatures(),
      clickedFeature,
      comparePropertyId
    );
    if (foundFeatureInSource) source.removeFeature(foundFeatureInSource);
    else source.addFeature(clickedFeature);
  };

  #handlePointClickOnCoordinateLayer = (
    source,
    coordinateFeatures,
    comparePropertyId
  ) => {
    const clickedFeature = coordinateFeatures.features[0];
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

  #modeChanged = (realEstate, coordinate) => {
    this.#clearSource(this.highlightSource);
    this.#showHideLayers(realEstate, coordinate);
    if (realEstate) this.#zoomToSource(this.realEstateSource);
    if (coordinate) this.#zoomToSource(this.coordinateSource);
  };

  #showHideLayers = (realEstateLayer, coordinateLayer) => {
    this.realEstateLayer.setVisible(realEstateLayer);
    this.coordinateLayer.setVisible(coordinateLayer);
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

  testEdpConnection = () => {
    console.log("Test EDP connection");
  };

  testWfsList = () => {
    const FNRs = ["140064566", "140041902"];
    this.searchModel.findRealEstatesWithNumbers(FNRs);
  };

  testCoordinateList = () => {
    const coordinates = [
      {
        Northing: "6396150",
        Easting: "145000",
        SpatialReferenceSystemIdentifier: "3007",
        Label: "Min punkt",
      },
      {
        Northing: "6396200",
        Easting: "145150",
        SpatialReferenceSystemIdentifier: "3007",
        Label: "",
      },
    ];
    this.searchModel.findCoordinatesWithCoordinates(coordinates);
  };
}

export default IntegrationModel;
