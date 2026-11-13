# AiChat plugin

A chat window where users ask about the map in plain language. The assistant
finds layers, turns them on and off, changes the background, opens tools, goes
to places, searches WFS data and, with the routing MCP server, shows routes.

The client is thin. The model, the tools, the layer search and all access checks
live in Backend (`apps/backend/server/apis/v2/services/ai/`). The client sends a
question with the current map state, and gets back a stream of events that it
renders and acts on.

## Setup

1. **Backend**: set `AI_CHAT_ENABLED=true`, a provider and an API key in
   `apps/backend/.env`. See the `*** AI CHAT SETTINGS ***` section of
   `.env.example` for every setting, including limits, embeddings and MCP
   servers.
2. **Client**: `"AiChat"` must be in `availableTools` in `appConfig.json`.
3. **Map config**: add a tool of type `aichat`. Backend refuses the chat for a
   map, or a user, that doesn't have it after the config wash, so
   `visibleForGroups` controls who may use it.

```json
{
  "type": "aichat",
  "index": 0,
  "options": {
    "title": "Kartassistent",
    "description": "Prata med kartan.",
    "target": "right",
    "visibleForGroups": [],
    "featureSources": [
      {
        "id": "1209",
        "description": "Alla adresser. Sök på gatunamn och nummer."
      },
      {
        "id": "923ad824-1104-4ce1-9a34-dd7c7fc65501",
        "description": "Sjöar, djup i meter.",
        "extraFields": ["maxdjup", "medeldjup"]
      }
    ]
  }
}
```

### Options

| Option                                                    | Used by | Description                                                                                   |
| --------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `title`                                                   | Client  | Window title. Default `AI-chatt`.                                                             |
| `description`                                             | Client  | Tooltip and drawer text.                                                                      |
| `introText`                                               | Client  | Shown before the first question. Newlines are kept.                                           |
| `drawnFeatures`                                           | Client  | Whether users may share their Sketch drawings. On unless `false`.                             |
| `target`, `position`, `width`, `height`, `visibleAtStart` | Client  | The usual window options.                                                                     |
| `featureSources`                                          | Backend | WFS sources the assistant may query, see below. Opt-in: without it there's no feature search. |

**`featureSources`** – each entry is `{ id, description, extraFields? }`:

- `id` is a WFS search source in the layer config.
- `description` is what the model reads to pick the source and build filters.
  This is where you teach it, for example which field to filter on, what the
  values look like, or to use `near` with distance 0 for "which area is this
  address in". Write it in the map's language.
- `extraFields` adds fields beyond the search and infobox fields that Backend
  already allows.

A source that the map also uses as a layer must be allowed in Search for the
user, so that the limits set there hold in the chat too.

### Instructions

An installation can add to the system prompt with Markdown files in
`apps/backend/App_Data/ai/`:

- `instructions.md` for every map
- `<map>.instructions.md` for one map

Both are optional and sent with every question, so keep them short. Good uses
are synonyms for local jargon and what the assistant must not do (such as give
rulings in permit matters).

## How a question flows

```
AiChatView ── send ──▶ AiChatModel ── POST /api/v2/ai/chat ──▶ Backend
                         │   { map, conversationId, message,
                         │     mapState: { layers, background, drawn } }
                         │
                         ◀── server-sent events ──────────────────┘
                         │   start · text · tool_status · layers ·
                         │   action · done · error
                         ▼
             ChatStore (state)       MapActions (map side effects)
                  │                     │
             AiChatView renders     LayerControlModel, ToolControlModel,
             messages, layer        Search, Preset, RouteLayer
             lists, route cards
```

- **`start`** carries the conversation id. Conversations live in Backend's
  memory. If one is gone (`conversation_lost`, after a restart or idle
  timeout), the client asks the same question again in a new one and tells the
  user.
- **`text`** is a piece of the answer, rendered as Markdown. Images are not
  rendered and only `http(s)` links are, since answers can quote layer metadata.
- **`tool_status`** drives the status line ("Söker bland lagren…"). The texts
  are in `TOOL_STATUS` in `constants.ts`.
- **`layers`** is a list of layers under the answer, with a checkbox, radio
  button or "Gå till" each. They follow the map through `useLayerVisibility`.
- **`action`** is something to do on the map. Backend has already checked that
  the user may do it. See `MapActions.runAction`.
- **`done`** / **`error`** end the turn. A stream that ends without either
  counts as a lost connection.

Stopping an answer aborts the fetch, which makes Backend discard the turn.

### Actions

| Action                         | What the client does                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `set_layer_visibility`         | `layerControl.setLayerVisibility()` per id                           |
| `set_background`               | `layerControl.showLayer()`                                           |
| `open_plugin` / `close_plugin` | `toolControl.showTool()` / `hideTool()`                              |
| `go_to_place`                  | Publishes `preset.selectPreset` with the preset from the map config  |
| `show_features`                | Publishes `search.showFeatureCollections`, so results show in Search |
| `clear_features`               | Clears the routes and the Search results                             |
| `show_route`                   | Shows route cards, and fetches the geometry into `RouteLayer`        |

A client that gets an action or event it doesn't know warns in the console and
carries on, so Backend can be upgraded first.

## Features worth knowing

### Shared drawings

When the user has drawn with Sketch, a toggle appears above the input. Turned
on, up to 20 finished, visible drawings are sent with each question, as
GeoJSON with their titles. The model can then search inside an area or route
around it. `DrawnFeatures` only reads the Sketch layer and never changes it.
Circles become polygons and long freehand lines are simplified. Backend has
the same limits, see `services/ai/features/drawn.ts`.

### Routes

Routing comes from an MCP server that Backend calls (`AI_ROUTING_MCP_*`). The
model only sees a summary. The geometry is fetched by the browser straight from
the MCP server through a signed URL, so it never passes Backend or the model.
That server must therefore be reachable from the browser, and allow this site
in its CORS origins.

Routes are drawn in `RouteLayer`, a system layer that is not in the layer
switcher or the URL. Each answer's routes replace the ones before, and the
checkboxes on the route cards only work while that answer's routes are on the
map.

### Downloads

An answer that drew something gets a download menu: **KML** (with styles,
opens in Sketch), **GPX** (points and lines only) and **GeoJSON**. All are in
WGS84. Each answer keeps its own copy, so it can be downloaded after newer
answers have replaced it on the map. Routes unchecked on the map are left out.

## Files

| File                                                 | Purpose                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `AiChat.tsx`                                         | Plugin entry, `BaseWindowPlugin` wrapper                    |
| `AiChatModel.ts`                                     | Owns the conversation, sends questions, handles events      |
| `chatStore.ts`                                       | State for `useSyncExternalStore`, notifies once per frame   |
| `chatTransport.ts`                                   | The POST, error codes, and parsing events                   |
| `sse.ts`                                             | Server-sent events over `fetch` (`EventSource` can't POST)  |
| `mapActions.ts`                                      | Runs actions on the map, keeps what each answer drew        |
| `drawnFeatures.ts`                                   | Reads Sketch drawings to share                              |
| `routeLayer.ts`                                      | The layer that shows routes and reachable areas             |
| `routeStyles.ts`                                     | Route colors and styles, on the map and in downloads        |
| `routeFormat.ts`                                     | Formatting of times, distances and frequencies              |
| `exportDrawn.ts`                                     | KML, GPX and GeoJSON downloads                              |
| `AiChatView.tsx`                                     | The window: message list, status, input                     |
| `ChatMessageItem.tsx`                                | One message, with its Markdown, layers, routes and notices  |
| `LayerResultList.tsx`                                | The layer list under an answer                              |
| `RouteCard.tsx`, `RouteDetails.tsx`, `RouteRows.tsx` | A route's summary and its details                           |
| `DownloadMenu.tsx`                                   | The download menu                                           |
| `DrawnToggle.tsx`                                    | The "share drawings" switch                                 |
| `constants.ts`                                       | All user-facing text, error texts, limits                   |
| `types.ts`                                           | Options, props, and the event and action types from Backend |

## Development notes

- **State lives in the model, not the view.** The model is created once per
  plugin, so a conversation survives closing the window and a running answer
  keeps going meanwhile.
- **Notify once per frame.** A network chunk can carry hundreds of `text`
  events. Notifying React for each one triggers "Maximum update depth
  exceeded", so `ChatStore` batches with `requestAnimationFrame`.
- **Keep Backend and client types in sync.** `types.ts` mirrors what
  `services/ai/orchestrator.ts` and `tools/events.ts` send. When adding an
  action, add it to `ChatAction` and the switch in `MapActions.runAction`. The
  `never` check there fails the build if you forget.
- **New tools need a status text** in `TOOL_STATUS`, or the status line falls
  back to "Tänker…".
- **Use the shared models.** Layers go through `LayerControlModel` and tools
  through `ToolControlModel`, as everywhere else in the client.
- **Text is Swedish** and lives in `constants.ts`.
- **Sensitive data.** The input warns against personal data, as questions go
  to a cloud model. MCP servers with `client` exposure would keep results away
  from the model. The `mcp_result` event exists for that, but Backend keeps such
  servers off until the client can show their results.
