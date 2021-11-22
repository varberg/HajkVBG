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
    this.searchModel = settings.searchModel;

    this.initMapLayers();
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {
    this.localObserver.subscribe("mf-wfs-search", (featureCollection) => {
      this.drawResponseFromWfs(featureCollection);
    });
  };

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
    console.log("Test draw polygon");

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
    console.log("Test draw point");

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
    this.drawSourcePointPolygon.clear();
    this.drawSourcePointPolygon.on(
      props.listenerText,
      this.handleDrawFeatureAdded
    );
  };

  handleDrawFeatureAdded = (e) => {
    this.map.removeInteraction(this.draw);
    this.map.clickLock.delete("search");
    this.searchModel.findRealEstates(e.feature);
  };

  drawResponseFromWfs = (featureCollection) => {
    console.log(featureCollection);
  };

  handleWindowOpen = () => {
    this.localObserver.publish("window-opened");
  };

  testEdpConnection = () => {
    console.log("Test EDP connection");
  };
}

export default IntegrationModel;
