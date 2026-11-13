export const DEFAULT_TITLE = "AI-chatt";
export const DEFAULT_DESCRIPTION = "Hitta och tänd kartlager genom att fråga";
export const DEFAULT_INTRO_TEXT =
  "Fråga mig om kartan, så hjälper jag dig. Du kan till exempel skriva:\n\n• Vilka lager finns om naturvård?\n• Tänd lagret med skolor\n• Byt bakgrund till flygfoto\n• Öppna ritverktyget";

// Also enforced by Backend, see controllers/ai/controller.ts
export const MAX_MESSAGE_LENGTH = 4000;

export const UI_STRINGS = {
  inputLabel: "Skriv din fråga",
  sensitiveWarning:
    "Skriv inte in känsliga uppgifter, till exempel personnummer.",
  send: "Skicka",
  stop: "Stoppa",
  stopped: "Du stoppade svaret.",
  newConversation: "Ny konversation",
  thinking: "Tänker…",
  goToPlace: "Gå till",
  layerList: "Lager från svaret",
  conversationRestarted:
    "Den förra konversationen hade upphört, så frågan skickades som en ny konversation.",
  truncated: "Svaret blev för långt och är avkortat.",
  pluginUnavailable: "Verktyget kunde inte öppnas.",
  placeUnavailable: "Platsen kunde inte visas.",
  searchUnavailable: "Sökningen är inte tillgänglig i den här kartan.",
  eventFailed: "En del av svaret kunde inte visas.",
  showRoute: "Visa rutten på kartan",
  routeUnavailable: "En eller flera rutter kunde inte visas på kartan.",
  route: "Rutt",
  reach: "Nåbart område",
  line: "Linje",
  streets: "Gator längs vägen",
  legs: "Delsträckor",
  steps: "Resans delar",
  stops: "Hållplatser",
  nearestStops: "Närmaste hållplatser",
  places: (count: number) => (count === 1 ? "1 plats" : `${count} platser`),
  departuresPerHour: (departures: string) => `${departures} avg./h`,
  meters: "m",
  walk: "Gå",
  walkTime: "gång",
  waitTime: "väntan",
  rideTime: "åktid",
  waitAt: (line: string | undefined, at: string | undefined) =>
    ["Vänta", line && `på linje ${line}`, at && `vid ${at}`]
      .filter(Boolean)
      .join(" "),
  towards: "mot",
  changes: (count: number) =>
    count === 0 ? "inga byten" : count === 1 ? "1 byte" : `${count} byten`,
  tripsPerHour: (trips: string) => `${trips} turer/h`,
  transitNote:
    "Typisk restid med genomsnittlig väntan, inte en tidtabell. Se trafikbolaget för avgångar.",
  moreStreets: (count: number) => `och ${count} till`,
  seconds: "s",
  minutes: "min",
  hours: "h",
  km: "km",
  roadKm: "km väg",
  downloadLabel: "Ladda ner svarets kartdata",
  nothingToDownload: "Det fanns inget att ladda ner.",
  includeDrawn: (count: number, max: number) =>
    count > max
      ? `Ta med ritade objekt (${max} av ${count})`
      : `Ta med ritade objekt (${count})`,
  includeDrawnHint:
    "Låter assistenten använda det du ritat, till exempel för att söka inom ett område eller undvika det i en rutt. Bara former och titlar skickas.",
  drawnShared: (count: number) =>
    count === 1 ? "Med 1 ritat objekt" : `Med ${count} ritade objekt`,
  avoided: (count: number) =>
    count === 1 ? "Undviker 1 område" : `Undviker ${count} områden`,
  detour: (time: string) => `${time} längre än utan`,
  noDetour: "ingen omväg",
  closedRoads: "Avstängda vägar",
};

/** The choices in the download menu, see DownloadMenu */
export const DOWNLOAD_FORMATS = [
  {
    format: "kml",
    name: "KML",
    hint: "Google Earth och Hajks ritverktyg, med färger",
  },
  { format: "gpx", name: "GPX", hint: "GPS och mobilappar" },
  { format: "geojson", name: "GeoJSON", hint: "GIS, till exempel QGIS" },
] as const;

export const GPX_UNAVAILABLE = "Ytor kan inte sparas som GPX";

export const MODE_NAMES: Record<string, string> = {
  car: "Bil",
  bike: "Cykel",
  walk: "Gång",
  transit: "Kollektivtrafik",
  bus: "Buss",
  rail: "Tåg",
  tram: "Spårvagn",
  ferry: "Färja",
};

export const TOOL_STATUS: Record<string, string> = {
  search_layers: "Söker bland lagren…",
  filter_layers: "Filtrerar lagren…",
  get_layer_details: "Läser om lagret…",
  present_layers: "Förbereder lagerlistan…",
  set_layer_visibility: "Ändrar lagren på kartan…",
  set_background: "Byter bakgrund…",
  open_plugin: "Öppnar verktyget…",
  close_plugin: "Stänger verktyget…",
  go_to_place: "Går till platsen…",
  search_features: "Söker i kartans data…",
  show_features: "Visar träffarna på kartan…",
  clear_features: "Rensar sökresultaten…",
  route: "Beräknar rutten…",
  multi_stop_route: "Beräknar rutten…",
  travel_time_matrix: "Jämför restider…",
  reachable_within: "Beräknar nåbart område…",
  find_street: "Letar efter gatan…",
  road_info: "Läser om vägen…",
  line_info: "Läser om linjen…",
  nearest_stops: "Letar efter närmaste hållplatser…",
  show_route: "Visar rutten på kartan…",
};

const GENERIC_ERROR = "Det gick inte att få ett svar. Försök igen senare.";

export const ERRORS = {
  generic: GENERIC_ERROR,
  connection:
    "Anslutningen bröts innan svaret var klart. Kontrollera din anslutning och försök igen.",
  forbidden: "Du har inte behörighet att använda chatten.",
  tooMany: "Du har ställt för många frågor. Vänta en stund och försök igen.",
};

// The codes of AiChatError, which stop a request before it starts streaming
export const REQUEST_ERRORS: Record<string, string> = {
  not_enabled: "Chatten är inte aktiverad.",
  unavailable: "Chatten är inte tillgänglig just nu. Försök igen senare.",
  invalid_request:
    "Frågan kunde inte tas emot. Kontrollera texten och försök igen.",
  turn_running:
    "Den förra frågan besvaras fortfarande. Vänta en stund och försök igen.",
  daily_limit:
    "Chatten har nått sin gräns för i dag. Kartan fungerar som vanligt.",
  map_not_found: "Kartan finns inte längre. Ladda om sidan och försök igen.",
};

// The codes of `error` events, which end a turn that has started streaming
export const TURN_ERRORS: Record<string, string> = {
  refusal: "Modellen ville inte svara på frågan.",
  max_tokens: "Svaret blev för långt. Försök med en smalare fråga.",
  max_iterations: "Frågan krävde för många steg. Försök med en smalare fråga.",
  token_budget: "Frågan blev för stor. Försök med en smalare fråga.",
  timeout: "Svaret tog för lång tid. Försök igen.",
  model_error: GENERIC_ERROR,
};
