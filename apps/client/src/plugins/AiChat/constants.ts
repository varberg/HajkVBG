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
  useBackground: "Använd",
  goToPlace: "Gå till",
  backgroundInUse: "Används",
  layerList: "Lager från svaret",
  conversationRestarted:
    "Den förra konversationen hade upphört, så frågan skickades som en ny konversation.",
  truncated: "Svaret blev för långt och är avkortat.",
  pluginUnavailable: "Verktyget kunde inte öppnas.",
  placeUnavailable: "Platsen kunde inte visas.",
  searchUnavailable: "Sökningen är inte tillgänglig i den här kartan.",
  eventFailed: "En del av svaret kunde inte visas.",
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
