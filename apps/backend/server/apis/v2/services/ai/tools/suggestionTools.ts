import { define, object } from "./schema.ts";
import type { Tool } from "./types.ts";

export const MAX_SUGGESTIONS = 3;
// A chip holds a short question, not a paragraph
export const MAX_SUGGESTION_LENGTH = 80;

/** Follow-up questions under the answer, on maps that turn them on. */
export const suggestionTools: Tool[] = [
  define<{ questions: string[] }>({
    name: "suggest_follow_ups",
    kind: "action",
    endsTurn: true,
    isAvailable: ({ mapInfo }) => mapInfo.suggestions,
    description: `Show up to ${MAX_SUGGESTIONS} follow-up questions under your answer, which the user can send with a click. Call it last, after the text of your answer, as nothing you write after it is shown.`,
    inputSchema: object({
      questions: {
        type: "array",
        items: { type: "string" },
        description: `Short questions, at most ${MAX_SUGGESTION_LENGTH} characters each, written as the user would write them.`,
      },
    }),
    run({ questions }, { userCatalog }) {
      if (!userCatalog.mapInfo.suggestions) {
        return { result: { shown: 0, reason: "Not on this map." } };
      }
      const items = [
        ...new Set(
          questions
            .map((question) => question.trim().replace(/\s+/g, " "))
            .filter(
              (question) =>
                question !== "" && question.length <= MAX_SUGGESTION_LENGTH
            )
        ),
      ].slice(0, MAX_SUGGESTIONS);
      return {
        result: { shown: items.length },
        events: items.length > 0 ? [{ type: "suggestions", items }] : [],
      };
    },
  }),
];
