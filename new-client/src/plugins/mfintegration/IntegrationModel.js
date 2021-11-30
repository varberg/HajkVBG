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

    this.initMapLayers();
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {
    this.localObserver.subscribe("mf-wfs-search-realEstates", (realEstates) => {
      this.drawRealEstateResponseFromWfs(realEstates);
    });
  };

  initMapLayers = () => {
    this.handleWindowOpen();
    this.addDrawPointPolygonLayer();
    this.addRealEstateLayer();
  };

  createNewVectorSource = () => {
    return new VectorSource({ wrapX: false });
  };

  createNewVectorLayer = (source, style) => {
    return new VectorLayer({
      source: source,
      style: style,
    });
  };

  createNewVectorCircleStyle = (style) => {
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

  addDrawPointPolygonLayer = () => {
    const stylePointPolygon = this.getDrawPointPolygonStyle();
    this.drawSourcePointPolygon = this.createNewVectorSource(stylePointPolygon);

    const drawPointPolygonLayer = this.createNewVectorLayer(
      this.drawSourcePointPolygon,
      stylePointPolygon
    );
    this.map.addLayer(drawPointPolygonLayer);
  };

  getDrawPointPolygonStyle = () => {
    const drawPolygonStyleSettings = this.getDrawPointPolygonStyleSettings();
    return this.createNewVectorCircleStyle(drawPolygonStyleSettings);
  };

  getDrawPointPolygonStyleSettings = () => {
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

  addRealEstateLayer = () => {
    const stylePolygon = this.getRealEstateStyle();
    this.realEstateSource = this.createNewVectorSource(stylePolygon);

    this.realEstateLayer = this.createNewVectorLayer(
      this.realEstateSource,
      stylePolygon
    );
    this.map.addLayer(this.realEstateLayer);
  };

  getRealEstateStyle = () => {
    const drawRealEstateStyleSettings = this.getRealEstateStyleSettings();

    return this.createNewVectorCircleStyle(drawRealEstateStyleSettings);
  };

  getRealEstateStyleSettings = () => {
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

  createNewVectorLayer = (source, style) => {
    return new VectorLayer({
      source: source,
      style: style,
    });
  };

  drawPolygon = () => {
    const drawFunctionProps = {
      listenerText: "addfeature",
      requestText: "search",
      style: this.getDrawPointPolygonStyle(),
      source: this.drawSourcePointPolygon,
      type: "Polygon",
    };
    this.createDrawFunction(drawFunctionProps);
  };

  drawPoint = () => {
    const drawFunctionProps = {
      listenerText: "addfeature",
      requestText: "search",
      style: this.getDrawPointPolygonStyle(),
      source: this.drawSourcePointPolygon,
      type: "Point",
    };
    this.createDrawFunction(drawFunctionProps);
  };

  createDrawFunction = (props) => {
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
    this.searchModel.findRealEstates(e.feature);
    this.clearSource(this.drawSourcePointPolygon);
  };

  drawRealEstateResponseFromWfs = (realEstates) => {
    this.addFeatureCollectionToSource(this.realEstateSource, realEstates);
  };

  addFeatureCollectionToSource = (source, realEstates) => {
    const realEstateFeatures = this.createFeaturesFromFeatureCollection(
      realEstates.selectionGeometry.getGeometry().getType(),
      realEstates.featureCollection,
      realEstates.transformation
    );
    if (realEstateFeatures.noFeaturesFound) return;
    if (realEstateFeatures.addOrRemoveFeature) {
      this.handlePointClickOnRealEstateLayer(source, realEstateFeatures);
      return;
    }
    this.addNoDuplicatesToSource(realEstateFeatures, source);
  };

  handlePointClickOnRealEstateLayer = (source, realEstateFeatures) => {
    const clickedFeature = realEstateFeatures.features[0];
    const foundFeatureInSource = this.getRealEstateInSource(
      source.getFeatures(),
      clickedFeature
    );
    if (foundFeatureInSource) source.removeFeature(foundFeatureInSource);
    else source.addFeature(clickedFeature);
  };

  addNoDuplicatesToSource = (featureSet, source) => {
    const featuresInSource = source.getFeatures();
    if (featuresInSource.length === 0) {
      source.addFeatures(featureSet.features);
      return;
    }

    const featuresToAddToSource = featureSet.features.filter((feature) => {
      if (!this.getRealEstateInSource(featuresInSource, feature))
        return feature;
      return false;
    });

    source.addFeatures(featuresToAddToSource);
  };

  getRealEstateInSource = (featuresInSource, clickedFeature) => {
    const featuresFoundInSource = featuresInSource.filter((feature) => {
      if (
        feature.getProperties().fnr_fr === clickedFeature.getProperties().fnr_fr
      )
        return feature;
      return false;
    });

    if (featuresFoundInSource.length === 0) return null;
    return featuresFoundInSource[0];
  };

  clearSource = (source) => {
    source.clear();
  };

  createFeaturesFromFeatureCollection = (
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
}

export default IntegrationModel;
