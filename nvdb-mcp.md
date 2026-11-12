# NVDB routing MCP – findings

Tested 2026-11-09 against a local instance at `http://127.0.0.1:8000/mcp`.

## The server

- Name `nvdb-routing`. It runs FastMCP on uvicorn, speaks MCP protocol 2025-06-18 and uses stateless streamable HTTP (no session id).
- Auth is a bearer token. Without it the server answers 401. The token belongs in the backend `.env` and must never reach the client.
- It routes on the Swedish national road database (NVDB, loaded 2026-11-09: 51 layers, 52 113 routing edges). The network is stored in EPSG:3007.
- Coverage is Varbergs kommun plus about 15 km around it.
- It has no prompts and no resources, only tools.

## Tools

All tools are annotated `readOnlyHint`, `idempotentHint` and not `openWorldHint`.

| Tool | Input | Returns |
| --- | --- | --- |
| `route` | origin, destination, mode | minutes, km, the streets in order (km and minutes each), `snap_m`, `geometry_url` |
| `multi_stop_route` | 2–25 stops, mode, `optimize` | the order used, minutes and km per leg and in total, `geometry_url`. Reordering is exact up to 9 intermediate stops. |
| `travel_time_matrix` | 2–25 points, mode | `matrix[i][j]` in minutes, with null for no route |
| `reachable_within` | origin, minutes (at most 60), mode | road_km, hull_km2 (an upper bound), `geometry_url` with the reachable roads |
| `find_street` | name | one lon/lat point in the middle of each separate stretch with that name, and suggestions when nothing matches |
| `road_info` | point, radius_m (at most 500) | the nearest roads: name, road number, network, functional class, speed limit, one-way, surface, urban area |
| `data_status` | – | when the data was loaded and how much there is |

How the modes work:
- **car**: the car network (bilnät), with speed limits per direction. Urban driving runs at 85 % of the limit, and roundabouts at 30 km/h or less. Speed bumps, stop signs and give-way signs add small penalties. One-way streets and turn restrictions are respected.
- **bike**: the car and cycle networks except motorways, at a fixed cycling speed (lower on gravel).
- **walk**: everything except motorways, in both directions.

The server does not model access bans, weight or height limits, time-dependent rules or traffic.

Points are given as `{x, y, srid, label?}`. The srid defaults to 4326, where x is longitude and y is latitude. Other EPSG codes work too, so Hajk can pass coordinates in the map's projection directly.

## What works well

- Every result comes back both as JSON text and as `structuredContent`.
- Geometry is kept out of the model's context. Results carry a `geometry_url`, which is also sent as a `resource_link` described as "for the application, not the model".
- The geometry URLs are signed and expire after 1 h. Changing one character of the token returns 403. They are cached as `private, max-age=300`.
- Errors are clear and usable by the model. One example: "point 1 (11.97, 57.7, EPSG:4326) is 26.1 km from the nearest road usable by car. It is outside the network…"
- `snap_m` shows how far each input point was from the road, so a bad geocode can be spotted.
- The server instructions tell the model to geocode with its own tools first, which matches Hajk's search.

## Issues

1. **The schemas are incompatible with our registry.** The input schemas use `$ref`/`$defs`, `anyOf` (nullable label), `minimum`/`maximum`, `exclusiveMinimum`, `minItems`/`maxItems` and `minLength`/`maxLength`. Our `JsonSchema` subset (`apps/backend/server/apis/v2/services/ai/tools.ts`) excludes these because Claude's strict mode rejects them with a 400. The bridge must inline `$defs`, turn `anyOf [T, null]` into `type: [T, "null"]`, drop the bound keywords and make every property required. The server still checks the bounds itself.
2. ~~**The geometry URL only works from the backend.**~~ Out of date: `/geojson/{token}` takes `?srid=` and `?roads=`, and has a CORS config (`cors_origins`). Hajk now lets the browser fetch it directly in the map projection. That needs the server's `public_url` to be reachable from browsers and the Hajk origin in `cors_origins`.
3. **Fixed 2026-11-10.** **The descriptions contradicted themselves.** The shared mode text says "turn restrictions respected", but `travel_time_matrix` and `reachable_within` then say "Ignores turn restrictions".
4. **Fixed 2026-11-10** (`MODE_RULES` is now only in `INSTRUCTIONS`, and the `Point` descriptions are shorter). **The same text was repeated everywhere.** The mode and coverage paragraph appears in four tool descriptions and in the server instructions, about 2–3 KB of tokens on every request. It should appear once, in the instructions.
5. **Handled in Hajk** (the model must always give a label). **Minor:** a point without a label is echoed back as "point 1", "point 2", and the model may repeat that to the user. The Hajk side should always send labels.
6. **Minor:** the geometry URL needs no auth (the signature is the capability). That is acceptable with the 1 h expiry, but it is a deliberate choice worth stating.

## Integration in Hajk (implemented 2026-11-10)

See the code in `apps/backend/server/apis/v2/services/ai/mcp/` (generic) and `.../ai/mcp/servers/routing/` (routing). What differs from the proposal below: geometry is fetched by the browser, not the backend; routes start from feature ids, so the model never handles coordinates; and the model only sees a slim view of each result.

### Original proposal

This fits the existing plan (`PLAN-ai-chat.md`): the registry already allows external MCP tools to register as `kind: "read"` without changes to the orchestrator.

1. **MCP client in the backend.** Use `@modelcontextprotocol/sdk` with streamable HTTP. Configure the URL and token in `.env` and list the tools at startup.
2. **Schema bridge.** Convert each tool's schema to the registry subset (see issue 1) and register it with a prefix, for example `nvdb_route`.
3. **Geometry step.** After an NVDB tool call, if the result has a `resource_link` with `application/geo+json`:
   - fetch the GeoJSON,
   - convert it to the map projection,
   - emit `show_features` (or a dedicated `show_route` action with its own style),
   - remove `geometry_url` from the tool result before it goes to the model.
4. **Geocoding.** Resolve addresses through Hajk's search first, then pass coordinates in the map srid together with a `label`.
5. **Failure.** If the MCP server is down or the token is missing, leave the NVDB tools out of the registry rather than failing the chat.

## Open questions

- Should routes get their own map style and their own clear action, separate from WFS search results?
- Should the NVDB tools be shown for every map, or switched on per map in the configuration?
- What is the production host for the MCP server, and can the Hajk backend reach it?
