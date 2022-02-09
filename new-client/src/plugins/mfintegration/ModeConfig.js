//New layers/modes that can be used within the tool will need to be added here until/if it is made configurable
//to create new modes from admin.
export const defaultModeConfig = {
  realEstate: {
    name: "realEstate",
    active: true,
    type: "polygon",
    displayName: "Fastighet",
    displayNamePl: "Fastigheter",
    wmsId: null,
    wfsId: null,
    wfsSearchField: "fnr_fr",
    wfsGeom: "geom",
    wfsLayer: null,
    activateWms: false,
    editable: false,
  },
  coordinate: {
    name: "coordinate",
    type: "point",
    displayName: "Koordinat",
    displayNamePl: "Koordinater",
    wmsId: null,
    wfsId: null,
    wfsSearchField: "",
    wfsGeom: "geom",
    wfsLayer: null,
    activateWms: false,
    editable: true,
  },
  area: {
    name: "area",
    type: "polygon",
    displayName: "Område",
    displayNamePl: "Områden",
    wmsId: null,
    wfsId: null,
    wfsSearchField: "",
    wfsGeom: "geom",
    wfsLayer: null,
    activateWms: false,
    editable: true,
  },
  survey: {
    name: "survey",
    type: "polygon",
    displayName: "Undersökning",
    displayNamePl: "Undersökningar",
    wmsId: null,
    wfsId: null,
    wfsSearchField: "",
    wfsGeom: "geom",
    wfsLayer: null,
    activateWms: false,
    editable: true,
  },
  contamination: {
    name: "contamination",
    type: "polygon",
    displayName: "Förorening",
    displayNamePl: "Föroreningar",
    wmsId: null,
    wfsId: null,
    wfsSearchField: "",
    wfsGeom: "geom",
    wfsLayer: null,
    activateWms: false,
    editable: true,
  },
};

//accept the tool options from the map configuration (e.g. map_1.json). and replace default values with config values.
export const initModeConfig = (options = {}) => {
  let modeOptions = defaultModeConfig;

  Object.keys(options).forEach((mapMode) => {
    let mappedOptions = defaultModeConfig[mapMode];
    let optionsFields = Object.keys(defaultModeConfig[mapMode]);

    for (const [key, value] of Object.entries(options[mapMode])) {
      if (optionsFields.includes(key)) {
        mappedOptions[key] = value;
      }
    }
    modeOptions[mapMode] = mappedOptions;
  });
  return modeOptions;
};
