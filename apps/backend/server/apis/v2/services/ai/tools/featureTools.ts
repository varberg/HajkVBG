import { searchFeatures, showFeatures } from "../features/featureSearch.ts";
import type { SearchInput, ShowInput } from "../features/featureSearch.ts";
import { PAGE_SIZE } from "../toolSupport.ts";
import { define, idList, nullable, object, offsetSchema } from "./schema.ts";
import type { Tool } from "./types.ts";

/** Search the feature sources, and show the features in the Search panel. */
export const featureTools: Tool[] = [
  define<SearchInput>({
    name: "search_features",
    kind: "read",
    description: `Query the live data of one feature source, such as its addresses, schools or lakes. The sources and their fields are listed in your instructions. All criteria must match, and null means no criterion. Returns ${PAGE_SIZE} features per page, with \`total\` (all matches), \`reachable\` (how many can be paged through), \`truncated\` and a \`resultId\` for show_features. A feature's \`id\` can be used in \`near\`, and its \`title\` can be empty. Geometry is never returned.`,
    inputSchema: object({
      source_id: { type: "string", description: "The id of a source." },
      text: {
        type: ["string", "null"],
        description:
          "Found anywhere in the search fields of the source, ignoring case, and matched as one phrase.",
      },
      filters: nullable({
        type: "array",
        items: object({
          field: { type: "string", description: "A field of the source." },
          op: {
            type: "string",
            enum: ["eq", "ne", "lt", "lte", "gt", "gte", "like"],
            description:
              "`like` means that the field contains the value. `ne` also matches features with no value.",
          },
          value: {
            type: "string",
            description: "The value, also for numeric fields.",
          },
        }),
        description: "Conditions on the fields of the source.",
      }),
      near: nullable({
        ...object({
          feature_id: {
            type: "string",
            description: "The id of a feature from an earlier search.",
          },
          distance_m: {
            type: "integer",
            description: "In metres. 0 means intersecting the feature.",
          },
        }),
        description:
          "Only features near another feature, nearest first and with `distanceM`, unless `sort` is set. If there are too many to sort by distance, the result has `tooMany` and no features.",
      }),
      sort: nullable({
        ...object({
          field: { type: "string", description: "A field of the source." },
          descending: {
            type: "boolean",
            description: "True gives the highest value first.",
          },
        }),
        description:
          "The order. Features with no value in the field are left out, also from `total`.",
      }),
      count_only: {
        type: "boolean",
        description: "True returns only `total`, and ignores `sort`.",
      },
      offset: offsetSchema,
    }),
    run: async (input, context) => ({
      result: await searchFeatures(input, context),
    }),
  }),

  define<ShowInput>({
    name: "show_features",
    kind: "action",
    description:
      "Show features from earlier searches in the Search panel and on the map, which also zooms there. Replaces what the panel showed before. Always check `shown`, `truncated` and `rejected` before telling the user what happened.",
    inputSchema: object({
      result_ids: idList("The `resultId` of the searches to show."),
      feature_ids: nullable(
        idList("Only these features of the results. Null means all of them.")
      ),
    }),
    run: showFeatures,
  }),

  define<Record<string, never>>({
    name: "clear_features",
    kind: "action",
    description:
      "Clear the Search panel and remove all search results, and any route, from the map, the same way as the user clearing the search. It always clears everything, also what the user searched for themselves, and can't remove only some of the features.",
    inputSchema: object({}),
    run: () => ({
      result: { cleared: true },
      events: [{ type: "action", action: "clear_features" }],
    }),
  }),
];
