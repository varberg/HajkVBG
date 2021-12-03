import { Fill, Stroke, Style, Circle } from "ol/style";
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
    this.#bindSubscriptions();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("mf-wfs-search-realEstates", (realEstates) => {
      this.#drawRealEstateResponseFromWfs(realEstates);
    });
  };

  #initMapLayers = () => {
    this.handleWindowOpen();
    this.#addDrawPointPolygonLayer();
    this.#addRealEstateLayer();
  };

  drawPolygon = () => {
    const drawFunctionProps = {
      listenerText: "addfeature",
      requestText: "search",
      style: this.#getDrawPointPolygonStyle(),
      source: this.drawSourcePointPolygon,
      type: "Polygon",
    };
    this.#createDrawFunction(drawFunctionProps);
  };

  drawPoint = () => {
    const drawFunctionProps = {
      listenerText: "addfeature",
      requestText: "search",
      style: this.#getDrawPointPolygonStyle(),
      source: this.drawSourcePointPolygon,
      type: "Point",
    };
    this.createDrawFunction(drawFunctionProps);
  };

  clearResultsRealEstate = () => {
    this.#clearSource(this.realEstateSource);
  };

  clearResultsCoordinate = () => {
    // TODO Aktiveras när en källa för koordinaterna finns
    //this.#clearSource(this.coordinateSource);
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
    const stylePolygon = this.#getRealEstateStyle();
    this.realEstateSource = this.#createNewVectorSource(stylePolygon);

    this.realEstateLayer = this.#createNewVectorLayer(
      this.realEstateSource,
      stylePolygon
    );
    this.map.addLayer(this.realEstateLayer);
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
    this.#addFeatureCollectionToSource(this.realEstateSource, realEstates);
    this.#updateRealEstateList(this.realEstateSource, realEstates);
  };

  #updateRealEstateList = (source, realEstates) => {
    const props = {
      features: source.getFeatures(),
      propertyName: realEstates.geometryField,
    };
    this.localObserver.publish(
      "mf-wfs-map-updated-features-real-estates",
      props
    );
  };

  removeRealEstateItemFromSource = (listItem) => {
    const mapFeature = this.realEstateSource.getFeatureByUid(listItem.mapId);
    this.realEstateSource.removeFeature(mapFeature);
  };

  #addFeatureCollectionToSource = (source, realEstates) => {
    const realEstateFeatures = this.#createFeaturesFromFeatureCollection(
      realEstates.searchType,
      realEstates.featureCollection,
      realEstates.transformation
    );
    this.#clearOldRealEstataSearch(source, realEstates);
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

  #clearOldRealEstataSearch = (source, realEstates) => {
    if (realEstates.searchType === "List") this.clearResultsRealEstate();
  };

  #handlePointClickOnRealEstateLayer = (
    source,
    realEstateFeatures,
    comparePropertyId
  ) => {
    const clickedFeature = realEstateFeatures.features[0];
    const foundFeatureInSource = this.#getRealEstateInSource(
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
        !this.getRealEstateInSource(
          featuresInSource,
          feature,
          comparePropertyId
        )
      )
        return feature;
      return false;
    });

    source.addFeatures(featuresToAddToSource);
  };

  #getRealEstateInSource = (
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
      let realEstateFeature = new Feature({
        geometry: geometry,
      });
      realEstateFeature.setProperties(feature.properties);
      return realEstateFeature;
    });

    const pointClick = selectionGeometryType === "Point";
    return { features: features, addOrRemoveFeature: pointClick };
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
        Northing: "6396195",
        Easting: "317554",
        SpatialReferenceSystemIdentifier: "3006",
        Label: "Min punkt",
      },
      {
        Northing: "6396200",
        Easting: "317500",
        SpatialReferenceSystemIdentifier: "3006",
        Label: "",
      },
    ];

    // Bara för test
    this.localObserver.publish(
      "mf-wfs-map-updated-features-coordinates",
      coordinates
    );
  };
}

export default IntegrationModel;
