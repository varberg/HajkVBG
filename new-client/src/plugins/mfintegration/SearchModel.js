import { intersects } from "ol/format/filter";
import { hfetch } from "utils/FetchWrapper";
import { WFS } from "ol/format";

export default class SearchModel {
  /**
   * Constructor for the search model.
   * @param {object} settings The settings from the json settings file.
   */
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.localObserver = settings.localObserver;

    this.wfsConfig = this.getWfsConfig();
    this.wfsParser = new WFS();
  }

  getWfsConfig = () => {
    const wfsConfig = {
      featureNS: "featureNS",
      featurePrefix: "featurePrefix",
      featureTypes: ["fastighet.wfs.v1:fastighet"],
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "https://geodata.sbk.goteborg.se/service/wfs/fastighet/v1",
    };
    return wfsConfig;
  };

  createFilterGeometry = (selectionGeometry, wfsConfig) => {
    const crs = this.getMapCRS();
    const srs = wfsConfig.srsName;
    if (crs !== srs)
      return selectionGeometry.values_.geometry.clone().transform(crs, srs);
    return selectionGeometry.values_.geometry;
  };

  getMapCRS = () => {
    return this.map.getView().getProjection().getCode();
  };

  getSpatialFilter = (geometry, wfsConfig) => {
    const geometryName = wfsConfig.geometryName;
    return new intersects(geometryName, geometry);
  };

  getWfsGetFeatureOtions = (filterGeometry, wfsConfig) => {
    return {
      srsName: wfsConfig.srsName,
      featureNS: "", // Must be blank for IE GML parsing
      featurePrefix: wfsConfig.featurePrefixName,
      featureTypes: wfsConfig.featureTypes,
      outputFormat: "application/json",
      geometryName: wfsConfig.geometryName,
      filter: this.getSpatialFilter(filterGeometry, wfsConfig),
    };
  };

  getWfsBodyXml = (wfsGetFeatureOtions) => {
    return new XMLSerializer().serializeToString(
      this.wfsParser.writeGetFeature(wfsGetFeatureOtions)
    );
  };

  getWfsRequest = (selectionGeometry, wfsConfig) => {
    const filterGeometry = this.createFilterGeometry(
      selectionGeometry,
      wfsConfig
    );
    const wfsGetFeatureOtions = this.getWfsGetFeatureOtions(
      filterGeometry,
      wfsConfig
    );
    const wfsBodyXml = this.getWfsBodyXml(wfsGetFeatureOtions);

    return {
      credentials: "same-origin",
      //signal: signal,
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
      },
      body: wfsBodyXml,
    };
  };

  findRealEstates = (selectionGeometry) => {
    const wfsRequest = this.getWfsRequest(selectionGeometry, this.wfsConfig);
    hfetch(this.wfsConfig.url, wfsRequest).then((response) => {
      response.json().then((featureCollection) => {
        this.localObserver.publish("mf-wfs-search", featureCollection);
      });
    });
  };
}
