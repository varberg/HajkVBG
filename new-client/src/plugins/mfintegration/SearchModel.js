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
    this.options = settings.options;
    this.localObserver = settings.localObserver;

    this.wfsConfigRealEstate = this.options.mapObjects.realEstate;
    this.wfsConfigCoordinates = this.options.mapObjects.coordinate;
    this.wfsConfigAreas = this.options.mapObjects.area;
    this.wfsConfigSurvey = this.options.mapObjects.survey;
    this.wfsConfigContamination = this.options.mapObjects.contamination;
  }

  findRealEstatesWithGeometry = (selectionFeature) => {
    this.#findWithGeometry(selectionFeature, this.wfsConfigRealEstate);
  };

  findRealEstatesWithNumbers = (realEstatesList) => {
    this.#findWithIds(realEstatesList, this.wfsConfigRealEstate);
  };

  findCoordinatesWithGeometry = (selectionFeature) => {
    this.#findWithGeometry(selectionFeature, this.wfsConfigCoordinates);
  };

  findCoordinatesWithCoordinates = (coordinateList) => {
    let wfsConfig = this.options.mapObjects.coordinate.wfsLayer;
    /*** Lägg till en wfs-sökning här ***/
    // const filter
    // const wfsRequest
    // hfetch ...
    let id = 0;
    const features = coordinateList.map((coordinate) => {
      return {
        geometry: {
          type: "Point",
          coordinates: [coordinate.easting, coordinate.northing],
        },
        id: "koordinat." + ++id,
        geometry_name: "geom",
        properties: { label: coordinate.label },
        type: "Feature",
      };
    });
    const simulatedFeatureCollection = { features: features };

    let answer = this.#createResponse(
      simulatedFeatureCollection,
      wfsConfig.geometryField,
      this.#getTransformationWfsToMap(wfsConfig),
      "List"
    );
    answer.selectedCoordinates = coordinateList;
    answer.type = "coordinate";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  findAreasWithGeometry = (selectionFeature) => {
    this.#findWithGeometry(selectionFeature, this.wfsConfigAreas);
  };

  // Skall vara ett nummer, men är en koordinat i vår testkod
  findAreasWithNumbers = (areaList) => {
    let wfsConfig = this.options.mapObjects.area.wfsLayer;
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
        geometry_name: wfsConfig.geometryName,
        properties: { saknas: "-", omrade: areaList.name },
        type: "Feature",
      },
    ];

    const simulatedFeatureCollection = { features: features };

    let answer = this.#createResponse(
      simulatedFeatureCollection,
      wfsConfig.geometryField,
      this.#getTransformationWfsToMap(wfsConfig),
      "List"
    );
    answer.selectedCoordinates = areaList;
    answer.type = "area";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  findSurveysWithGeometry = (selectionFeature) => {
    this.#findWithGeometry(selectionFeature, this.wfsConfigSurvey);
  };

  findSurveysWithNumbers = (surveyList) => {
    let wfsConfig = this.options.mapObjects.survey.wfsLayer;
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
        geometry_name: wfsConfig.geometryName,
        properties: { saknas: "-", omrade: surveyList.name },
        type: "Feature",
      },
    ];

    const simulatedFeatureCollection = { features: features };

    let answer = this.#createResponse(
      simulatedFeatureCollection,
      wfsConfig.geometryField,
      this.#getTransformationWfsToMap(wfsConfig),
      "List"
    );
    answer.selectedCoordinates = surveyList;
    answer.type = "survey";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  findContaminationsWithGeometry = (selectionFeature) => {
    this.#findWithGeometry(selectionFeature, this.wfsConfigContamination);
  };

  findContaminationsWithNumbers = (contaminationList) => {
    let wfsConfig = this.options.mapObjects.contamination.wfsLayer;
    /*** Lägg till en wfs-sökning här ***/
    // const filter
    // const wfsRequest
    // hfetch ...
    let id = 0;
    const features = [
      {
        geometry: {
          type: "Polygon",
          coordinates: contaminationList.coordinates,
        },
        id: "område." + ++id,
        geometry_name: wfsConfig.geometryName,
        properties: { saknas: "-", omrade: contaminationList.name },
        type: "Feature",
      },
    ];

    const simulatedFeatureCollection = { features: features };

    let answer = this.#createResponse(
      simulatedFeatureCollection,
      wfsConfig.geometryField,
      this.#getTransformationWfsToMap(wfsConfig),
      "List"
    );
    answer.selectedCoordinates = contaminationList;
    answer.type = "contamination";
    this.localObserver.publish("mf-wfs-search", answer);
  };

  #findWithGeometry = (selectionFeature, config) => {
    const filter = this.#getSpatialFilter(
      selectionFeature.getGeometry(),
      this.#getTransformationMapToWfs(config.wfsLayer),
      config.wfsLayer
    );
    const wfsRequest = this.#getWfsRequest(filter, config.wfsLayer);
    if (wfsRequest === null) {
      console.warn(
        "WFS anropet kunde inte skapas korrekt. Kolla verktygets konfiguration."
      );
    }

    hfetch(config.wfsLayer.url, wfsRequest).then((response) => {
      response.json().then((featureCollection) => {
        let answer = this.#createResponse(
          featureCollection,
          config.wfsLayer.geometryField,
          this.#getTransformationWfsToMap(config.wfsLayer),
          selectionFeature.getGeometry().getType()
        );
        answer.searchedFeature = selectionFeature;
        answer.type = config.name;
        this.localObserver.publish("mf-wfs-search", answer);
      });
    });
  };

  #findWithIds = (listIds, config) => {
    const filter = this.#getListFilter(listIds, config.wfsLayer);
    const wfsRequest = this.#getWfsRequest(filter, config.wfsLayer);
    if (wfsRequest === null) {
      console.warn(
        "WFS anropet kunde inte skapas korrekt. Kolla verktygets konfiguration."
      );
      this.localObserver.publish("mf-wfs-failed-search");
      return;
    }

    hfetch(config.wfsLayer.url, wfsRequest)
      .then((response) => {
        response
          .json()
          .then((featureCollection) => {
            let answer = this.#createResponse(
              featureCollection,
              config.wfsLayer.geometryField,
              this.#getTransformationWfsToMap(config.wfsLayer),
              "List"
            );
            answer.searchedIds = listIds;
            answer.type = config.name;
            this.localObserver.publish("mf-wfs-search", answer);
          })
          .catch((error) => {
            console.warn(error);
            this.localObserver.publish("mf-wfs-failed-search", error);
          });
      })
      .catch((error) => {
        console.warn(error);
        this.localObserver.publish("mf-wfs-failed-search", error);
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
    return geometry;
  };

  #getListFilter = (list, wfsConfig) => {
    const geometryField = wfsConfig.geometryField;
    if (list.length === 1) return new EqualTo(geometryField, list[0]);
    return new Or(
      ...list.map((id) => {
        return new EqualTo(geometryField, id);
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

  #createResponse = (
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

    //Will be null if #getWfsBodyXml fails.
    const wfsBodyXml = this.#getWfsBodyXml(wfsFeatureOptions);

    //If #getWfsBodyXml throws an error (which can happen if incorrectly configured) it will catch and retun null.
    //here we return null instead, to use later instead of sending a request.
    if (wfsBodyXml === null) {
      return null;
    }

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

  #getWfsBodyXml = (wfsGetFeatureOptions) => {
    try {
      new WFS().writeGetFeature(wfsGetFeatureOptions);
    } catch (error) {
      return null;
    }

    return new XMLSerializer().serializeToString(
      new WFS().writeGetFeature(wfsGetFeatureOptions)
    );
  };
}
