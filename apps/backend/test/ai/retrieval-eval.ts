/**
 * Retrieval evaluation on the real config, against the live embedding API.
 *
 *   node --env-file=.env test/ai/retrieval-eval.ts [--final] [--cold] [--out file]
 *
 * Not a test: it needs an API key and the production App_Data, so `npm test`
 * doesn't run it. Held-out questions only run with --final, and must not be
 * used for tuning. --cold embeds everything into a temporary cache, to measure
 * a full index build.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { parseArgs } from "util";

import accessService from "../../server/apis/v2/services/ai/access.service.ts";
import { createEmbedder } from "../../server/apis/v2/services/ai/search/embedder.ts";
import { SearchService } from "../../server/apis/v2/services/ai/search/search.service.ts";
import type { SearchResult } from "../../server/apis/v2/services/ai/search/search.service.ts";

const TOP_N = 5;
const TARGET = 0.9;

interface Question {
  id: string;
  kind: string;
  question: string;
  heldOut: boolean;
  expected: Array<{ id: string; caption: string }>;
}

interface Outcome {
  id: string;
  kind: string;
  question: string;
  heldOut: boolean;
  /** Rank of the first expected layer, from 1, or null if it wasn't found. */
  keywordRank: number | null;
  hybridRank: number | null;
  hybridMode: SearchResult["mode"];
  hybridTop: string[];
  ms: number;
}

const { values: args } = parseArgs({
  options: {
    final: { type: "boolean", default: false },
    cold: { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const { map, questions: all } = JSON.parse(
  fs.readFileSync(new URL("retrieval-questions.json", import.meta.url), "utf-8")
) as { map: string; questions: Question[] };
const questions = all.filter((q) => args.final || !q.heldOut);

const embedder = createEmbedder();
if (embedder === null) {
  throw new Error("No embedder configured, which would only measure keywords.");
}

const coldDir = args.cold
  ? fs.mkdtempSync(path.join(os.tmpdir(), "hajk-ai-eval-"))
  : undefined;
const hybrid = new SearchService({ embedder, cacheDir: coldDir });
const keyword = new SearchService({ embedder: null });
// What an anonymous visitor sees. Needs the aichat tool in the map.
const userCatalog = await accessService.getUserCatalog(map);

const buildStart = performance.now();
await hybrid.buildVectors(map);
const buildMs = performance.now() - buildStart;

// The first query also loads the SDK and opens a connection
await hybrid.search(userCatalog, "uppvärmning");

const rankOf = (result: SearchResult, q: Question): number | null => {
  const expected = new Set(q.expected.map((e) => e.id));
  const index = result.hits.findIndex((hit) => expected.has(hit.record.id));
  return index === -1 ? null : index + 1;
};

const outcomes: Outcome[] = [];
for (const q of questions) {
  const keywordResult = await keyword.search(userCatalog, q.question, 50);
  const started = performance.now();
  const hybridResult = await hybrid.search(userCatalog, q.question, 50);
  outcomes.push({
    id: q.id,
    kind: q.kind,
    question: q.question,
    heldOut: q.heldOut,
    keywordRank: rankOf(keywordResult, q),
    hybridRank: rankOf(hybridResult, q),
    hybridMode: hybridResult.mode,
    hybridTop: hybridResult.hits.slice(0, TOP_N).map((h) => h.record.caption),
    ms: performance.now() - started,
  });
}

const hit = (rank: number | null) => rank !== null && rank <= TOP_N;
const rate = (list: Outcome[], key: "keywordRank" | "hybridRank") =>
  list.length === 0
    ? "-"
    : `${list.filter((o) => hit(o[key])).length}/${list.length} (${Math.round(
        (100 * list.filter((o) => hit(o[key])).length) / list.length
      )}%)`;

const line = (label: string, list: Outcome[]) =>
  console.log(
    `${label.padEnd(14)} hybrid ${rate(list, "hybridRank").padEnd(14)} keyword ${rate(list, "keywordRank")}`
  );

console.log(`Embedder ${embedder.id}, top ${TOP_N}, target ${TARGET * 100}%`);
line("All run", outcomes);
line(
  "Tuning",
  outcomes.filter((o) => !o.heldOut)
);
line(
  "Held out",
  outcomes.filter((o) => o.heldOut)
);
for (const kind of new Set(outcomes.map((o) => o.kind))) {
  line(
    `  ${kind}`,
    outcomes.filter((o) => o.kind === kind)
  );
}

const fallbacks = outcomes.filter((o) => o.hybridMode !== "hybrid");
const times = outcomes.map((o) => o.ms).sort((a, b) => a - b);
const percentile = (p: number) =>
  Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))]);
console.log(
  `Index build ${Math.round(buildMs)} ms (${coldDir ? "cold, all layers embedded" : "from cache"})`
);
console.log(
  `Query latency p50 ${percentile(0.5)} ms, p95 ${percentile(0.95)} ms, max ${percentile(1)} ms`
);
console.log(`Fell back to keywords: ${fallbacks.length} of ${outcomes.length}`);

console.log("\nMisses, hybrid:");
for (const o of outcomes.filter((o) => !hit(o.hybridRank))) {
  console.log(
    `${o.id} ${o.heldOut ? "(held out) " : ""}[${o.kind}] ${o.question}\n    rank ${
      o.hybridRank ?? "none"
    }, keyword rank ${o.keywordRank ?? "none"}. Top: ${o.hybridTop.join(" | ")}`
  );
}

if (args.out) {
  fs.writeFileSync(
    args.out,
    JSON.stringify({ embedder: embedder.id, buildMs, outcomes }, null, 2)
  );
}
if (coldDir) {
  fs.rmSync(coldDir, { recursive: true, force: true });
}
process.exit(0);
