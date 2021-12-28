import { intersects, or as Or, equalTo as EqualTo } from "ol/format/filter";
import { hfetch } from "utils/FetchWrapper";
import { WFS } from "ol/format";
import Transform from "./Transformation/Transform";
import { wfsConfig } from "./mockdata/mockdataWFS";

export default class SearchModel {
  /**
   * Constructor for the search model.
   * @param {object} settings The settings from the json settings file.
   */
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.localObserver = settings.localObserver;

    this.wfsConfigRealEstate = wfsConfig().realEstate;
    this.wfsConfigCoordinates = wfsConfig().coordinate;
    this.wfsConfigAreas = wfsConfig().area;
    this.wfsConfigSurvey = wfsConfig().survey;
    this.wfsConfigContamination = wfsConfig().contamination;
  }

  findRealEstatesWithGeometry = (selectionFeature) => {
    const filter = this.#getSpatialFilter(
      selectionFeature.getGeometry(),
      this.#getTransformationMapToWfs(this.wfsConfigRealEstate),
      this.wfsConfigRealEstate
    );
    const wfsRequest = this.#getWfsRequest(filter, this.wfsConfigRealEstate);

    hfetch(this.wfsConfigRealEstate.url, wfsRequest).then((response) => {
      response.json().then((featureCollection) => {
        let answer = this.#createRespone(
          featureCollection,
          this.wfsConfigRealEstate.geometryField,
          this.#getTransformationWfsToMap(this.wfsConfigRealEstate),
          selectionFeature.getGeometry().getType()
        );
        answer.selectionFeature = selectionFeature;
        answer.type = "realEstate";
        this.localObserver.publish("mf-wfs-search", answer);
      });
    });
  };

  findRealEstatesWithNumbers = (realEstatesList) => {
    const filter = this.#getListFilter(
      realEstatesList,
      this.wfsConfigRealEstate
    );
    const wfsRequest = this.#getWfsRequest(filter, this.wfsConfigRealEstate);

    hfetch(this.wfsConfigRealEstate.url, wfsRequest).then((response) => {
      response.json().then((featureCollection) => {
        let answer = this.#createRespone(
          featureCollection,
          this.wfsConfigRealEstate.geometryField,
          this.#getTransformationWfsToMap(this.wfsConfigRealEstate),
          "List"
        );
        answer.selectedRealEstates = realEstatesList;
        answer.type = "realEstate";
        this.localObserver.publish("mf-wfs-search", answer);
      });
    });
  };

  findCoordinatesWithGeometry = (selectionFeature) => {};

  findCoordinatesWithCoordinates = (coordinateList) => {
    /*** Lägg till en wfs-sökning här ***/
    // const filter
    // const wfsRequest
    // hfetch ...
    let id = 0;
    const features = coordinateList.map((coordinate) => {
      return {
        geometry: {
          type: "Point",
          coordinates: [coordinate.Easting, coordinate.Northing],
        },
        id: "koordinat." + ++id,
        geometry_name: this.wfsConfigCoordinates.geometryName,
        properties: { label: coordinate.Label },
        type: "Feature",
      };
    });
    const simulatedFeatureCollection = { features: features };

    let answer = this.#createRespone(
      simulatedFeatureCollection,
      this.wfsConfigCoordinates.geometryField,
      this.#getTransformationWfsToMap(this.wfsConfigCoordinates),
      "List"
    );
    answer.selectedCoordinates = coordinateList;
    answer.type = "coordinate";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  findAreasWithGeometry = (selectionFeature) => {};

  // Skall vara ett nummer, men är en koordinat i vår testkod
  findAreasWithNumbers = (areaList) => {
    /*** Lägg till en wfs-sökning här ***/
    // const filter
    // const wfsRequest
    // hfetch ...
    let id = 0;
    const features = [
      {
        geometry: {
          type: "Polygon",
          coordinates: areaList.coordinates,
        },
        id: "område." + ++id,
        geometry_name: this.wfsConfigAreas.geometryName,
        properties: { saknas: "-", omrade: areaList.name },
        type: "Feature",
      },
    ];

    const simulatedFeatureCollection = { features: features };

    let answer = this.#createRespone(
      simulatedFeatureCollection,
      this.wfsConfigCoordinates.geometryField,
      this.#getTransformationWfsToMap(this.wfsConfigCoordinates),
      "List"
    );
    answer.selectedCoordinates = areaList;
    answer.type = "area";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  findSurveysWithGeometry = (selectionFeature) => {};

  findSurveysWithNumbers = (surveyList) => {
    /*** Lägg till en wfs-sökning här ***/
    // const filter
    // const wfsRequest
    // hfetch ...
    let id = 0;
    const features = [
      {
        geometry: {
          type: "Polygon",
          coordinates: surveyList.coordinates,
        },
        id: "område." + ++id,
        geometry_name: this.wfsConfigAreas.geometryName,
        properties: { saknas: "-", omrade: surveyList.name },
        type: "Feature",
      },
    ];

    const simulatedFeatureCollection = { features: features };

    let answer = this.#createRespone(
      simulatedFeatureCollection,
      this.wfsConfigCoordinates.geometryField,
      this.#getTransformationWfsToMap(this.wfsConfigCoordinates),
      "List"
    );
    answer.selectedCoordinates = surveyList;
    answer.type = "survey";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  findContaminationsWithGeometry = (selectionFeature) => {};

  findContaminationsWithNumbers = () => {
    /*** Lägg till en wfs-sökning här ***/
    // const filter
    // const wfsRequest
    // hfetch ...
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
    return geometry;
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

  #createRespone = (
    featureCollection,
    geometryField,
    transformation,
    searchType
  ) => {
    return {
      searchType: searchType,
      geometryField: geometryField,
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
}
