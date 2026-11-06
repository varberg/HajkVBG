// Small synthetic configs for the AI tests. Keep real names and groups out of here.

export const wmsLayer = (id: string, overrides: object = {}) => ({
  id,
  caption: `Layer ${id}`,
  url: "https://secret.example.com/wms",
  owner: "",
  infoOwner: "",
  infoText: "",
  infoUrl: "",
  content: "",
  date: "1651676357814",
  layers: [`${id}_name`],
  layersInfo: [{ id: `${id}_name`, caption: "" }],
  hideExpandArrow: false,
  ...overrides,
});

export const layersStore = () => ({
  wmslayers: [
    wmsLayer("plain", {
      caption: "Plangräns",
      infoOwner: "Stadsbyggnad",
      infoText: "<p>Första&nbsp;raden</p><br>Andra <b>raden</b>",
      infoUrl: "https://example.com/info",
      content: "plan",
    }),
    wmsLayer("sameCaption", { caption: "Plangräns" }),
    wmsLayer("group", {
      layers: ["sub_a", "sub_b"],
      layersInfo: [
        { id: "sub_a", caption: "Sublager A" },
        { id: "sub_b", caption: "" },
      ],
    }),
    wmsLayer("hiddenSubs", {
      layers: ["sub_c", "sub_d"],
      hideExpandArrow: true,
    }),
    wmsLayer("restricted"),
    wmsLayer("both", { infoText: "Egen text" }),
    wmsLayer("multiBackground", { layers: ["bg_a", "bg_b"] }),
    wmsLayer("unused"),
    wmsLayer("searchWms", { layers: ["s_a", "s_b"] }),
  ],
  wmtslayers: [{ id: "wmts1", caption: "WMTS", url: "https://secret" }],
  wfslayers: [{ id: "wfs1", caption: "WFS", url: "https://secret" }],
  wfstlayers: [{ id: "wfst1", caption: "WFST", url: "https://secret" }],
  vectorlayers: [{ id: "vector1", caption: "Vector", url: "https://secret" }],
  arcgislayers: [{ id: "arcgis1", caption: "ArcGIS", url: "https://secret" }],
});

export const mapConfig = () => ({
  tools: [
    {
      type: "layerswitcher",
      options: {
        backgroundSwitcherWhite: true,
        backgroundSwitcherBlack: false,
        enableOSM: true,
        enableOSMVector: false,
        baselayers: [{ id: "multiBackground" }],
        groups: [
          {
            id: "top",
            name: "Planering",
            infogrouptext: "<p>Om planering</p>",
            layers: [{ id: "plain" }, { id: "wmts1" }, { id: "arcgis1" }],
            groups: [
              {
                id: "nested",
                name: "Detaljer",
                exclusive: true,
                layers: [
                  { id: "sameCaption" },
                  { id: "group" },
                  { id: "hiddenSubs" },
                ],
                groups: [],
              },
            ],
          },
          {
            id: "secret",
            name: "Hemlig grupp",
            infogrouptext: "Hemlig gruppinfo",
            layers: [{ id: "restricted" }, { id: "both" }, { id: "vector1" }],
            groups: [],
          },
          {
            id: "broken",
            name: "Trasig",
            layers: [{ id: "dangling" }],
            groups: [],
          },
        ],
      },
    },
    {
      type: "search",
      options: {
        layers: [
          { id: "wfs1" },
          { id: "wfst1" },
          { id: "both" },
          { id: "searchWms" },
        ],
      },
    },
    { type: "aichat", options: {} },
    {
      type: "fir",
      options: { target: "toolbar", secretSetting: "do not expose" },
    },
    { type: "sketch", options: { target: "toolbar" } },
    { type: "print", options: { target: "left", title: "Skriv ut kartan" } },
    { type: "measurer", options: { target: "hidden" } },
    { type: "location", options: { target: "control" } },
  ],
});

type MapConfig = ReturnType<typeof mapConfig>;

/**
 * The fixture as washed for a user outside the group: the `secret` group loses
 * its layers, but `both` stays in Search and so must not get a toggle.
 */
export const washedMapConfig = (): MapConfig => {
  const config = mapConfig();
  const secret = config.tools[0].options!.groups!.find(
    (g) => g.id === "secret"
  )!;
  secret.layers = [];
  return config;
};
