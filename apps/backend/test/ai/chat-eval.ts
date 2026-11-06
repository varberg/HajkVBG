/**
 * Retrieval evaluation through the chat, on the real config and the live model.
 *
 *   AI_PROVIDER=openai node --env-file=.env test/ai/chat-eval.ts [--final] [--keyword] [--out file]
 *
 * Not a test: it needs API keys and the production App_Data, so `npm test`
 * doesn't run it. Without --final it runs the spent questions, to try out changes.
 * --final runs the held-out questions of retrieval-questions-chat.json, which
 * must not be used for tuning. --keyword turns off vector search, to compare.
 *
 * A question passes if an expected layer is in the top 5 of any search in the
 * turn, as the model writes the search terms and may search again. The model can
 * also find a layer without searching, through the group tree in its prompt, so
 * two more figures are shown for information. "Delivered": the layer got to the
 * user, as a control under the answer or as an action on the map, directly or
 * through a folder or sublayer. "Reached": it was in any tool result.
 */
import fs from "fs";
import { parseArgs } from "util";

import accessService from "../../server/apis/v2/services/ai/access.service.ts";
import { readChatLimits } from "../../server/apis/v2/services/ai/config.ts";
import { Orchestrator } from "../../server/apis/v2/services/ai/orchestrator.ts";
import type { ChatEvent } from "../../server/apis/v2/services/ai/orchestrator.ts";
import { createProvider } from "../../server/apis/v2/services/ai/providers/index.ts";
import defaultSearchService, {
  SearchService,
} from "../../server/apis/v2/services/ai/search/search.service.ts";
import { registry } from "../../server/apis/v2/services/ai/tools.ts";

const TOP_N = 5;
const TARGET = 0.9;
const CONCURRENCY = 4;

interface Question {
  id: string;
  kind: string;
  question: string;
  expected: Array<{ id: string; caption: string }>;
}

interface Outcome {
  id: string;
  kind: string;
  question: string;
  passed: boolean;
  delivered: boolean;
  reached: boolean;
  searches: string[];
  tools: string[];
  error: string | null;
  fellBack: boolean;
  ms: number;
}

const { values: args } = parseArgs({
  options: {
    final: { type: "boolean", default: false },
    keyword: { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const file = args.final
  ? "retrieval-questions-chat.json"
  : "retrieval-questions.json";
const { map, questions } = JSON.parse(
  fs.readFileSync(new URL(file, import.meta.url), "utf-8")
) as { map: string; questions: Question[] };

const searchService = args.keyword
  ? new SearchService({ embedder: null })
  : defaultSearchService;

const provider = await createProvider();
await searchService.buildVectors(map);

async function run(q: Question): Promise<Outcome> {
  const expected = new Set(q.expected.map((e) => e.id));
  const searches: string[] = [];
  const tools: string[] = [];
  let passed = false;
  let delivered = false;
  let reached = false;
  let fellBack = false;
  let error: string | null = null;

  // One orchestrator per question, so that the spies see this question only
  const chat = new Orchestrator({
    provider,
    access: accessService,
    limits: { ...readChatLimits(), dailyMaxTurns: 0, maxConversations: 0 },
    search: {
      async search(userCatalog, query, limit) {
        const result = await searchService.search(userCatalog, query, limit);
        searches.push(query);
        fellBack ||= !args.keyword && result.mode !== "hybrid";
        passed ||= result.hits
          .slice(0, TOP_N)
          .some((hit) => expected.has(hit.record.id));
        return result;
      },
    },
    registry: {
      ...registry,
      async run(name, input, context) {
        const output = await registry.run(name, input, context);
        tools.push(name);
        reached ||= [...expected].some((id) =>
          output.content.includes(`"id":${JSON.stringify(id)}`)
        );
        return output;
      },
    },
  });

  const started = performance.now();
  const turn = await chat.beginTurn({
    map,
    user: undefined,
    conversationId: null,
    message: q.question,
    // No background, or the model gets the answer to questions about it for free
    mapState: { layers: [], background: null },
  });
  await chat.runTurn(
    turn,
    (event: ChatEvent) => {
      if (event.type === "error") error = event.code;
      const ids =
        event.type === "layers"
          ? event.items.map((item) => item.id)
          : event.type !== "action" || "plugin" in event || "place" in event
            ? []
            : event.action === "set_background"
              ? [event.id]
              : event.visible
                ? event.ids
                : [];
      for (const id of ids) {
        const leaves = turn.userCatalog.groupsById.get(id ?? "")?.leafLayerIds;
        const targets = leaves ?? [id?.split(":")[0], id];
        delivered ||= targets.some((t) => t !== undefined && expected.has(t!));
      }
    },
    new AbortController().signal
  );

  return {
    id: q.id,
    kind: q.kind,
    question: q.question,
    passed,
    delivered,
    reached: reached || passed || delivered,
    searches,
    tools,
    error,
    fellBack,
    ms: performance.now() - started,
  };
}

const outcomes: Outcome[] = [];
const queue = [...questions];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let q = queue.shift(); q !== undefined; q = queue.shift()) {
      outcomes.push(await run(q));
    }
  })
);
outcomes.sort((a, b) => a.id.localeCompare(b.id));

const rate = (list: Outcome[], key: "passed" | "delivered" | "reached") => {
  const count = list.filter((o) => o[key]).length;
  return `${count}/${list.length} (${Math.round((100 * count) / list.length)}%)`;
};
const line = (label: string, list: Outcome[]) =>
  console.log(
    `${label.padEnd(14)} search ${rate(list, "passed").padEnd(14)} delivered ${rate(list, "delivered").padEnd(14)} reached ${rate(list, "reached")}`
  );

console.log(
  `${provider.id}, effort ${process.env.AI_REASONING_EFFORT ?? "default"}, ${file}, top ${TOP_N}, target ${TARGET * 100}%`
);
line("All", outcomes);
for (const kind of new Set(outcomes.map((o) => o.kind))) {
  line(
    `  ${kind}`,
    outcomes.filter((o) => o.kind === kind)
  );
}

const times = outcomes.map((o) => o.ms).sort((a, b) => a - b);
console.log(
  `Turn time p50 ${Math.round(times[Math.floor(times.length / 2)])} ms, max ${Math.round(times.at(-1) ?? 0)} ms`
);
console.log(
  `Fell back to keywords: ${outcomes.filter((o) => o.fellBack).length}, errors: ${outcomes.filter((o) => o.error).length}`
);

console.log("\nMisses, by search or delivery:");
for (const o of outcomes.filter((o) => !o.passed || !o.delivered)) {
  console.log(
    `${o.id} [${o.kind}] ${o.question}\n    search ${o.passed}, delivered ${o.delivered}, reached ${o.reached}, error ${o.error}, tools ${o.tools.join(",") || "none"}, searches: ${o.searches.join(" | ") || "none"}`
  );
}

if (args.out) {
  fs.writeFileSync(args.out, JSON.stringify(outcomes, null, 2));
}
process.exit(0);
