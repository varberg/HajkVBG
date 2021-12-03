import { intersects, or as Or, equalTo as EqualTo } from "ol/format/filter";
import { hfetch } from "utils/FetchWrapper";
import { WFS } from "ol/format";
import Transform from "./Transformation/Transform";

export default class SearchModel {
  /**
   * Constructor for the search model.
   * @param {object} settings The settings from the json settings file.
   */
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.localObserver = settings.localObserver;

    this.wfsConfig = this.#getWfsConfig();
  }

  findRealEstatesWithGeometry = (selectionFeature) => {
    const filter = this.#getSpatialFilter(
      selectionFeature.getGeometry(),
      this.#getTransformationMapToWfs(this.wfsConfig),
      this.wfsConfig
    );
    const wfsRequest = this.#getWfsRequest(filter, this.wfsConfig);

    hfetch(this.wfsConfig.url, wfsRequest).then((response) => {
      response.json().then((featureCollection) => {
        let realEstates = this.#createRealEstateRespone(
          featureCollection,
          this.#getTransformationWfsToMap(this.wfsConfig),
          selectionFeature.getGeometry().getType()
        );
        realEstates.selectionFeature = selectionFeature;
        this.localObserver.publish("mf-wfs-search-realEstates", realEstates);
      });
    });
  };

  findRealEstatesWithNumbers = (realEstatesList) => {
    const filter = this.#getListFilter(realEstatesList, this.wfsConfig);
    const wfsRequest = this.#getWfsRequest(filter, this.wfsConfig);

    hfetch(this.wfsConfig.url, wfsRequest).then((response) => {
      response.json().then((featureCollection) => {
        let realEstates = this.#createRealEstateRespone(
          featureCollection,
          this.#getTransformationWfsToMap(this.wfsConfig),
          "List"
        );
        realEstates.selectedRealEstates = realEstatesList;
        this.localObserver.publish("mf-wfs-search-realEstates", realEstates);
      });
    });
  };

  #getSpatialFilter = (geometry, transformation, wfsConfig) => {
    const filterGeometry = this.#transformFilterGeometry(
      geometry,
      transformation
    );
    const geometryName = wfsConfig.geometryName;
    return new intersects(geometryName, filterGeometry);
  };

  #transformFilterGeometry = (geometry, transformation) => {
    if (transformation) {
      return new Transform().transformGeometry(
        geometry.clone(),
        transformation.fromSrs,
        transformation.toSrs
      );
    }
    return geometry.getGeometry();
  };

  #getListFilter = (realEstatesList, wfsConfig) => {
    const geometryField = wfsConfig.geometryField;
    if (realEstatesList.length === 1)
      return new EqualTo(geometryField, realEstatesList[0]);
    return new Or(
      ...realEstatesList.map((fnrNumber) => {
        return new EqualTo(geometryField, fnrNumber);
      })
    );
  };

  #getTransformationMapToWfs = (wfsConfig) => {
    const crs = this.#getMapCRS();
    const srs = wfsConfig.srsName;
    return new Transform().createTransformationRelationships(crs, srs);
  };

  #getTransformationWfsToMap = (wfsConfig) => {
    const crs = this.#getMapCRS();
    const srs = wfsConfig.srsName;
    return new Transform().createTransformationRelationships(srs, crs);
  };

  #getMapCRS = () => {
    return this.map.getView().getProjection().getCode();
  };

  #createRealEstateRespone = (
    featureCollection,
    transformation,
    searchType
  ) => {
    return {
      searchType: searchType,
      geometryField: this.wfsConfig.geometryField,
      featureCollection: featureCollection,
      transformation: transformation,
    };
  };

  #getWfsRequest = (filter, wfsConfig) => {
    const wfsFeatureOptions = this.#createWfsFeatureOptions(filter, wfsConfig);
    const wfsBodyXml = this.#getWfsBodyXml(wfsFeatureOptions);

    return {
      credentials: "same-origin",
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
      },
      body: wfsBodyXml,
    };
  };

  #createWfsFeatureOptions = (filter, wfsConfig) => {
    return {
      srsName: wfsConfig.srsName,
      featureNS: "",
      featurePrefix: wfsConfig.featurePrefixName,
      featureTypes: wfsConfig.featureTypes,
      outputFormat: "application/json",
      geometryName: wfsConfig.geometryName,
      filter: filter,
    };
  };

  #getWfsBodyXml = (wfsGetFeatureOtions) => {
    return new XMLSerializer().serializeToString(
      new WFS().writeGetFeature(wfsGetFeatureOtions)
    );
  };

  #getWfsConfig = () => {
    const wfsConfig = {
      featureTypes: ["fastighet.wfs.v1:fastighet"],
      geometryField: "fnr_fr",
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "https://geodata.sbk.goteborg.se/service/wfs/fastighet/v1",
    };
    return wfsConfig;
  };
}
