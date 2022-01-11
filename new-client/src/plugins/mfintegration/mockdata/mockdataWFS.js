export const wfsConfig = () => {
  return {
    realEstate: {
      featureTypes: ["fastighet.wfs.v1:fastighet"],
      geometryField: "fnr_fr",
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "http://62.88.129.45:1330/api/v1/proxy/sbk/service/wfs/fastighet/v1",
    },
    coordinate: {
      featureTypes: ["fastighet.wfs.v1:fastighet"],
      geometryField: "fnr_fr",
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "https://geodata.sbk.goteborg.se/service/wfs/fastighet/v1",
    },
    area: {
      featureTypes: ["???"],
      geometryField: "geometryField",
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "???",
    },
    survey: {
      featureTypes: ["???"],
      geometryField: "geometryField",
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "???",
    },
    contamination: {
      featureTypes: ["???"],
      geometryField: "geometryField",
      geometryName: "geom",
      srsName: "EPSG:3007",
      url: "???",
    },
  };
};
