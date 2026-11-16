# AI chat (Backend)

The server side of the map assistant. It runs an agent loop on a cloud model
(Claude or OpenAI) that can search the map's layers, change the map, query WFS
sources and, through MCP servers, call outside tools such as routing. The
browser side is the `AiChat` plugin, see
`apps/client/src/plugins/AiChat/README.md`.

One endpoint: `POST /api/v2/ai/chat`, which streams the answer as server-sent
events. The route lives in `controllers/ai/`, everything else here.

## Turning it on

1. In `.env`, set `AI_CHAT_ENABLED=true`, `AI_PROVIDER` (`anthropic` or
   `openai`) and its API key. All settings are documented in the
   `*** AI CHAT SETTINGS ***` section of `.env.example`.
2. Add a tool of type `aichat` to the map config. A map, or a user after the
   config wash, without it gets no chat. Its `featureSources` option lists the
   WFS sources the assistant may query, see the client README.
3. Optional: an embedding API key (`AI_EMBEDDING_PROVIDER`, `OPENAI_API_KEY` or
   `VOYAGE_API_KEY`) for semantic layer search. Without one, layer search is
   keywords only.
4. Optional: instructions in `App_Data/ai/instructions.md` (all maps) and
   `App_Data/ai/<map>.instructions.md` (one map), added to the system prompt.
5. Optional: MCP servers, with `AI_<NAME>_MCP_*`.

The vendor SDKs and this whole folder are loaded on the first request, so an
install with the chat off never loads them. A missing provider, key or model
only turns off the chat (503). The map keeps working.

## Request flow

```
POST /ai/chat ─▶ controller.ts
                  │ validate body, map AiChatError → HTTP status
                  ▼
                Orchestrator.beginTurn            (plain HTTP errors from here)
                  │ AccessService.getUserCatalog  → 403/404 if no aichat tool
                  │ instructions, registry.refresh (new conversations)
                  │ conversation: get or create, running?, daily limit
                  ▼
                Orchestrator.runTurn              (SSE from here, errors as events)
                  │ sanitizeMapState → renderMapState (only sent when changed)
                  │ loop ≤ AI_MAX_ITERATIONS:
                  │   session.run (stream text) ─▶ tool calls?
                  │   registry.run: read tools in parallel, actions in order
                  │   tool events ─▶ browser (layers, action, …)
                  ▼
                commit on done · rollback on error/abort/timeout
```

- **Access first.** `beginTurn` builds the user's catalog before anything else,
  so a user without access makes Backend read nothing more. Errors before the
  stream starts are plain HTTP errors with a `details.code` that the client
  maps to a text (`not_enabled`, `turn_running`, `daily_limit`,
  `conversation_lost`, …).
- **A turn is all or nothing.** The provider session commits the turn's
  messages only when it completes. On an error, a timeout or a client that
  disconnects, it rolls back. Actions already sent to the browser stay done,
  and the next map state tells the model.
- **Map state** comes from the browser each turn: visible layers, background
  and shared drawings. `mapState.ts` limits it to what the user may reach, and
  it's only added to the user message when it changed.
- **Budgets per turn**: `AI_MAX_ITERATIONS`, `AI_TURN_TIMEOUT_MS`,
  `AI_TURN_MAX_TOKENS` (cached input doesn't count) and at most 30 turns per
  conversation. `AI_DAILY_MAX_TURNS` caps the whole site.

## Security model

The model runs in the cloud and reads text that anyone with config access can
write, so the design is about what it can _see_ and what it can _do_.

- **Allowlisted catalog.** `CatalogRecord` (`catalog/types.ts`) lists every
  field the model may know about a layer. URLs and other connection details
  never go into a record.
- **Per-user catalog.** `AccessService` applies the washed map config (AD
  groups) and builds a `UserCatalog` with separate sets for layers,
  backgrounds, search sources, places and groups. Every tool works on this,
  never on the raw catalog. Cached for 60 s per map and user.
- **WFS sources are opt-in** through `featureSources`. A source that is also a
  layer must be allowed in Search for the user. Only search, infobox and
  `extraFields` fields reach the model.
- **Metadata is data.** The system prompt says so, and the client renders
  answers without images and with web links only.
- **MCP exposure.** `AI_<NAME>_MCP_EXPOSURE` decides whether results may reach
  the model. Anything but `model` means `client`, which fails closed. Every
  bridged result passes `mcp/exposure.ts`. `client` servers are kept off for
  now, as the browser can't show their results yet.
- **No personal numbers.** Swedish personal and coordination numbers in the
  question and in drawing titles are masked with `x` (`personalNumbers.ts`).
  Client masks them too, this is for callers without it. Tool results aren't
  masked.
- **Tokens stay here.** MCP tokens never reach the browser. Route geometry is
  fetched by the browser from short-lived signed URLs that the MCP server
  issues.

## Tools

Tools are provider independent and live in `tools/`. Each has a `kind`:

- `read`: no side effects, run in parallel.
- `action`: changes the map through events to the browser, run one at a time
  in the order asked for.

| Module                     | Tools                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/layerTools.ts`      | `search_layers`, `filter_layers`, `get_layer_details`, `present_layers`, `set_layer_visibility`                                               |
| `tools/mapTools.ts`        | `set_background`, `open_plugin`, `close_plugin`, `go_to_place`                                                                                |
| `tools/featureTools.ts`    | `search_features`, `show_features`, `clear_features`                                                                                          |
| `tools/suggestionTools.ts` | `suggest_follow_ups`, only on maps with `suggestions: true`                                                                                   |
| routing MCP                | `route`, `multi_stop_route`, `travel_time_matrix`, `reachable_within`, `find_street`, `road_info`, `line_info`, `nearest_stops`, `show_route` |

A tool with `endsTurn` is called last, after the answer: when a model call asks
for nothing else, the turn ends without handing its result back, which saves a
model call. A tool with `isAvailable` is left out of the conversations of maps
where it gives false.

`tools/registry.ts` validates input against the schema and runs the tool. It
never throws: a failing tool returns `{ error }` to the model, which can often
recover. Throw `ToolError` for a message the model may see; anything else
becomes "The tool failed." and is logged.

**The tool list order is fixed.** A changed list breaks the prompt cache, so
built-in tools come first and extensions are appended in a fixed order.

### Adding a tool

1. Add it to the right module in `tools/`, with a `kind`, a description and an
   `inputSchema`. Schemas use the subset that both providers' strict modes
   accept (`tools/types.ts`): every property required, optional ones nullable,
   no `minimum`/`maxItems`/… — check bounds in `run` instead.
2. An action returns `events` (`tools/events.ts`). Add the event to the
   client's `types.ts` and `MapActions.runAction`.
3. Add a status text to `TOOL_STATUS` in the client's `constants.ts`.
4. Mention it in `prompt.ts` if the model needs guidance on when to use it.
5. Add tests in `test/ai/`.

### Adding an MCP server

1. Add `AI_<NAME>_MCP_URL`, `_TOKEN`, `_EXPOSURE` and `_TIMEOUT_MS` to `.env`
   and `.env.example`.
2. Add `mcp/servers/<name>/` with a `create<Name>Extension(config)` that
   returns a `ToolExtension`: `load()` gives its tools and prompt section, and
   `unavailablePrompt` tells the model why it can't answer while the server is
   down.
3. List it in `SERVERS` in `mcp/servers/index.ts`.

Use `mcp/mcpTools.ts` (`bridgeTool`, `callMcp`) to wrap the server's tools, and
`mcp/mcpSchema.ts` to turn its schemas into the strict subset. An extension
that fails to load is retried at most once a minute, and only new
conversations get its tools.

## Layer search

`search/` ranks layers for `search_layers` with a hybrid of:

- **Keywords** (`keywordIndex.ts`): MiniSearch over caption, group path, text,
  owner, content tag and sublayers, with Swedish stop words removed.
- **Vectors** (`vectorIndex.ts`, `embedder.ts`): embeddings of the same
  fields, from OpenAI or Voyage, independent of the chat provider.

The two rankings merge with reciprocal rank fusion (`RRF_K = 10`, tuned on the
eval set). Vectors are cached in `App_Data/ai-cache/` keyed by text and
embedder, so only changed layers are embedded again. Keep that folder on a
persistent volume. If the embedding API fails, search falls back to keywords
and says so in `mode`.

## Catalog

`catalog.service.ts` builds one raw catalog per map from the map and layer
configs (`catalog/walk.ts` walks the map config, `catalog/build.ts` builds
records, `catalog/text.ts` strips HTML). Every read compares file mtimes, so a
stale catalog is never served, and a file watcher can trigger a rebuild of the
search index.

## Features

`features/` is the WFS side of `search_features`:

- `featureFetch.ts` resolves the source and runs the query, at most 250
  features and 20 WFS requests per turn.
- `wfsQuery.ts` builds the filter (text, `eq`/`lt`/`gte`…, `near`), escaping
  literals.
- `wfsClient.ts` fetches with `AI_WFS_TIMEOUT_MS` and a 10 MB cap. Its errors
  are safe to show the model, and never contain the URL.
- `featureResults.ts` stores searches (not features) per conversation, so the
  model can refer to a `resultId` later and `show_features` runs them again.
- `drawn.ts` checks the user's shared Sketch drawings (ids `s1`…, at most 20,
  inside the map extent). They only live for the message they came with.

## Providers

`providers/` hides the vendors behind `ChatProvider` → `ProviderSession`. A
session keeps history in the vendor's native format, since reasoning and tool
call items must be replayed unchanged, and supports `commit`/`rollback` per
turn. A conversation stays on the provider it started with.

`test/ai/providers.contract.test.ts` runs the same contract against both. A
new provider must pass it.

## Conversations and scaling

Conversations, the daily counter and all caches live in memory, per process.
Conversations expire after `AI_CONVERSATION_TTL_MS` idle, and the oldest are
dropped beyond `AI_MAX_CONVERSATIONS`. A lost conversation returns
`conversation_lost`, and the client asks again in a new one.

With several backend instances, use sticky sessions. Each instance then counts
its own daily limit.

## Testing

```bash
npm test                          # all tests, including test/ai/*.test.ts
node --env-file=.env.example --test test/ai/orchestrator.test.ts
```

Two evaluation scripts need API keys and production `App_Data`, so `npm test`
doesn't run them:

- `test/ai/retrieval-eval.ts`: layer search alone, against the embedding API.
- `test/ai/chat-eval.ts`: retrieval through the whole chat, on the live model.

Both have held-out questions behind `--final`. Don't tune on those.

## Files

| Path                             | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `chat.service.ts`                | Creates the one orchestrator of the process, lazily      |
| `orchestrator.ts`                | The agent loop: turns, budgets, tool dispatch, errors    |
| `conversations.ts`               | Conversation store and daily turn counter                |
| `config.ts`                      | Reads `AI_*` settings                                    |
| `prompt.ts`                      | System prompt and user message, including the group tree |
| `instructions.ts`                | Reads `App_Data/ai/*.md`                                 |
| `mapState.ts`                    | Sanitizes and renders the browser's map state            |
| `access.service.ts`              | Per-user catalog, access checks                          |
| `catalog.service.ts`, `catalog/` | Raw catalog per map, from the configs                    |
| `search/`                        | Hybrid layer search, embeddings and their cache          |
| `tools.ts`, `tools/`             | Tool definitions, registry, schemas, events              |
| `toolSupport.ts`                 | `ToolError` and shared helpers                           |
| `features/`                      | WFS search, filters, drawn features                      |
| `mcp/`                           | MCP client, schema bridge, exposure, server extensions   |
| `providers/`                     | Anthropic and OpenAI behind one interface                |
| `locale.ts`                      | Sorting and matching for the map's language              |
| `../../controllers/ai/`          | The route, request validation and SSE streaming          |
