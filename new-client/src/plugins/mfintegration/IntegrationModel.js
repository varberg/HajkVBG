import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Circle } from "ol/style";

class IntegrationModel {
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.options = settings.options;
    this.localObserver = settings.localObserver;

    this.initMapLayers();
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {};

  initMapLayers = () => {
    this.handleWindowOpen();
    this.addDrawPolygonLayer();
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

  addDrawPolygonLayer = () => {
    const stylePolygon = this.getDrawPolygonStyle();
    this.drawSourcePolygon = this.createNewVectorSource(stylePolygon);

    const drawPolygonLayer = this.createNewVectorLayer(
      this.drawSourcePolygon,
      stylePolygon
    );
    this.map.addLayer(drawPolygonLayer);
  };

  getDrawPolygonStyle = () => {
    const drawPolygonStyleSettings = this.getDrawPolygonStyleSettings();
    return this.createNewVectorCircleStyle(drawPolygonStyleSettings);
  };

  getDrawPolygonStyleSettings = () => {
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
    const sourcePolygon = this.createNewVectorSource(stylePolygon);

    const realEstateLayer = this.createNewVectorLayer(
      sourcePolygon,
      stylePolygon
    );
    this.map.addLayer(realEstateLayer);
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
    console.log("Test draw polygon");

    debugger;
    this.draw = new Draw({
      source: this.drawSourcePolygon,
      type: "Polygon",
      freehand: false,
      stopClick: true,
      style: this.getDrawPolygonStyle(),
    });
    this.map.clickLock.add("search");
    this.map.addInteraction(this.draw);
    this.drawSourcePolygon.clear();
    this.drawSourcePolygon.on("addfeature", this.handleDrawFeatureAdded);
  };

  handleDrawFeatureAdded = (e) => {
    this.map.removeInteraction(this.draw);
    this.map.clickLock.delete("search");
    console.log("Polgyon", e.feature);
  };

  handleWindowOpen = () => {
    this.localObserver.publish("window-opened");
  };

  testEdpConnection = () => {
    console.log("Test EDP connection");
  };
}

export default IntegrationModel;
