import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

import { createAnthropicProvider } from "../../server/apis/v2/services/ai/providers/anthropic.provider.ts";
import { createOpenAiProvider } from "../../server/apis/v2/services/ai/providers/openai.provider.ts";
import type {
  ChatProvider,
  ProviderSession,
  StopReason,
} from "../../server/apis/v2/services/ai/providers/types.ts";

// One suite for both adapters, against mocked SDK streams. Each harness turns a
// neutral script into what its SDK would have streamed.

interface Script {
  text?: string[];
  calls?: Array<{ id: string; name: string; input: unknown }>;
  stop?: StopReason;
  usage?: { input: number; cached: number; output: number };
}

type Params = Record<string, unknown>;

interface Harness {
  provider: ChatProvider;
  requests: Params[];
  signals: Array<AbortSignal | undefined>;
  queue(script: Script): void;
  /** The native history as sent in the last request. */
  sentHistory(): unknown[];
  /** The marker that a script's reasoning left in the native history. */
  reasoning: unknown;
}

const snapshot = <T>(value: T): T => structuredClone(value);

function openAiHarness(options: { effort?: string } = {}): Harness {
  const scripts: Script[] = [];
  const requests: Params[] = [];
  const signals: Array<AbortSignal | undefined> = [];
  const reasoning = {
    type: "reasoning",
    id: "rs_1",
    summary: [],
    encrypted_content: "opaque",
  };

  const events = async function* (script: Script) {
    for (const delta of script.text ?? []) {
      yield { type: "response.output_text.delta", delta };
    }
    const text = (script.text ?? []).join("");
    const output: unknown[] = [reasoning];
    if (script.stop === "refusal") {
      output.push({
        type: "message",
        content: [{ type: "refusal", refusal: "No." }],
      });
    } else if (text !== "") {
      output.push({
        type: "message",
        content: [{ type: "output_text", text, annotations: [] }],
      });
    }
    for (const call of script.calls ?? []) {
      output.push({
        type: "function_call",
        id: `fc_${call.id}`,
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.input),
      });
    }
    const incomplete = script.stop === "max_tokens";
    yield {
      type: incomplete ? "response.incomplete" : "response.completed",
      response: {
        status: incomplete ? "incomplete" : "completed",
        incomplete_details: incomplete ? { reason: "max_output_tokens" } : null,
        output,
        usage: {
          input_tokens: script.usage?.input ?? 0,
          output_tokens: script.usage?.output ?? 0,
          input_tokens_details: { cached_tokens: script.usage?.cached ?? 0 },
        },
      },
    };
  };

  const client = {
    responses: {
      async create(params: Params, requestOptions: { signal?: AbortSignal }) {
        requests.push(snapshot(params));
        signals.push(requestOptions.signal);
        return events(scripts.shift() ?? {});
      },
    },
  };

  return {
    provider: createOpenAiProvider({
      client: client as unknown as OpenAI,
      model: "test-model",
      ...options,
    }),
    requests,
    signals,
    queue: (script) => scripts.push(script),
    sentHistory: () => requests.at(-1)?.input as unknown[],
    reasoning,
  };
}

const ANTHROPIC_STOPS: Record<StopReason, string> = {
  end: "end_turn",
  tool_calls: "tool_use",
  max_tokens: "max_tokens",
  refusal: "refusal",
};

function anthropicHarness(options: { model?: string } = {}): Harness {
  const scripts: Script[] = [];
  const requests: Params[] = [];
  const signals: Array<AbortSignal | undefined> = [];
  const reasoning = { type: "thinking", thinking: "", signature: "opaque" };

  const client = {
    beta: {
      messages: {
        stream(params: Params, requestOptions: { signal?: AbortSignal }) {
          requests.push(snapshot(params));
          signals.push(requestOptions.signal);
          const script = scripts.shift() ?? {};
          const listeners: Array<(delta: string) => void> = [];
          return {
            on(_event: "text", listener: (delta: string) => void) {
              listeners.push(listener);
              return this;
            },
            async finalMessage() {
              for (const delta of script.text ?? []) {
                listeners.forEach((listener) => listener(delta));
              }
              const text = (script.text ?? []).join("");
              const calls = script.calls ?? [];
              const uncached =
                (script.usage?.input ?? 0) - (script.usage?.cached ?? 0);
              return {
                content: [
                  reasoning,
                  ...(text === "" ? [] : [{ type: "text", text }]),
                  ...calls.map((c) => ({ type: "tool_use", ...c })),
                ],
                stop_reason:
                  ANTHROPIC_STOPS[
                    script.stop ?? (calls.length > 0 ? "tool_calls" : "end")
                  ],
                usage: {
                  input_tokens: uncached,
                  cache_read_input_tokens: script.usage?.cached ?? 0,
                  cache_creation_input_tokens: 0,
                  output_tokens: script.usage?.output ?? 0,
                },
              };
            },
          };
        },
      },
    },
  };

  return {
    provider: createAnthropicProvider({
      client: client as unknown as Anthropic,
      ...options,
    }),
    requests,
    signals,
    queue: (script) => scripts.push(script),
    sentHistory: () => requests.at(-1)?.messages as unknown[],
    reasoning,
  };
}

const tool = {
  name: "lookup",
  description: "Look something up.",
  inputSchema: {
    type: "object",
    properties: { word: { type: "string" } },
    required: ["word"],
    additionalProperties: false as const,
  },
};

const open = (harness: Harness): ProviderSession =>
  harness.provider.createSession({ system: "Be brief.", tools: [tool] });

const run = (session: ProviderSession, deltas: string[] = []) =>
  session.run({
    onTextDelta: (delta) => deltas.push(delta),
    signal: new AbortController().signal,
  });

const includes = (history: unknown[], value: unknown) =>
  JSON.stringify(history).includes(JSON.stringify(value));

for (const [name, harness] of [
  ["OpenAI", openAiHarness],
  ["Anthropic", anthropicHarness],
] as const) {
  describe(`${name} adapter contract`, () => {
    test("streams text deltas and returns the whole text", async () => {
      const h = harness();
      h.queue({ text: ["Hej", " där"] });
      const session = open(h);
      session.addUserMessage("Hej");
      const deltas: string[] = [];

      const turn = await run(session, deltas);

      assert.deepEqual(deltas, ["Hej", " där"]);
      assert.equal(turn.text, "Hej där");
      assert.deepEqual(turn.toolCalls, []);
      assert.equal(turn.stopReason, "end");
    });

    test("returns tool calls with parsed input", async () => {
      const h = harness();
      h.queue({
        calls: [
          { id: "a", name: "lookup", input: { word: "hus" } },
          { id: "b", name: "lookup", input: { word: "bil" } },
        ],
      });
      const session = open(h);
      session.addUserMessage("Slå upp");

      const turn = await run(session);

      assert.equal(turn.stopReason, "tool_calls");
      assert.deepEqual(turn.toolCalls, [
        { id: "a", name: "lookup", input: { word: "hus" } },
        { id: "b", name: "lookup", input: { word: "bil" } },
      ]);
    });

    test("sends the tools as strict, and the system prompt", async () => {
      const h = harness();
      const session = open(h);
      session.addUserMessage("Hej");
      await run(session);

      const [request] = h.requests;
      assert.ok(JSON.stringify(request).includes("Be brief."));
      const [sent] = request.tools as Array<{ strict: boolean; name: string }>;
      assert.equal(sent.name, "lookup");
      assert.equal(sent.strict, true);
    });

    test("replays tool results, and the model's output unchanged", async () => {
      const h = harness();
      h.queue({ calls: [{ id: "a", name: "lookup", input: { word: "hus" } }] });
      const session = open(h);
      session.addUserMessage("Slå upp");
      await run(session);

      session.addToolResults([
        { callId: "a", content: '{"meaning":"house"}', isError: false },
      ]);
      await run(session);

      const history = h.sentHistory();
      assert.ok(includes(history, h.reasoning), "reasoning is replayed");
      const text = JSON.stringify(history);
      assert.ok(text.indexOf('"a"') < text.indexOf("house"));
      assert.ok(text.includes("meaning"));
    });

    for (const [stop, expected] of [
      ["end", "end"],
      ["max_tokens", "max_tokens"],
      ["refusal", "refusal"],
    ] as const) {
      test(`normalises the stop reason ${stop}`, async () => {
        const h = harness();
        h.queue({ text: ["Text"], stop });
        const session = open(h);
        session.addUserMessage("Hej");
        assert.equal((await run(session)).stopReason, expected);
      });
    }

    test("a cut off tool call stops as max_tokens, not tool_calls", async () => {
      const h = harness();
      h.queue({
        calls: [{ id: "a", name: "lookup", input: { word: "h" } }],
        stop: "max_tokens",
      });
      const session = open(h);
      session.addUserMessage("Hej");
      assert.equal((await run(session)).stopReason, "max_tokens");
    });

    test("normalises usage, with cached tokens part of the input", async () => {
      const h = harness();
      h.queue({ usage: { input: 1000, cached: 800, output: 50 } });
      const session = open(h);
      session.addUserMessage("Hej");
      assert.deepEqual((await run(session)).usage, {
        inputTokens: 1000,
        outputTokens: 50,
        cachedTokens: 800,
      });
    });

    test("passes on the abort signal", async () => {
      const h = harness();
      const session = open(h);
      session.addUserMessage("Hej");
      const { signal } = new AbortController();
      await session.run({ onTextDelta: () => {}, signal });
      assert.equal(h.signals[0], signal);
    });

    test("rollback drops everything since the last commit", async () => {
      const h = harness();
      h.queue({ text: ["Första"] });
      h.queue({ calls: [{ id: "a", name: "lookup", input: { word: "x" } }] });
      const session = open(h);

      session.addUserMessage("Fråga ett");
      await run(session);
      session.commit();
      session.addUserMessage("Fråga två");
      await run(session);
      session.rollback();
      session.addUserMessage("Fråga tre");
      await run(session);

      const text = JSON.stringify(h.sentHistory());
      assert.ok(text.includes("Fråga ett"));
      assert.ok(text.includes("Första"));
      assert.ok(text.includes("Fråga tre"));
      assert.equal(text.includes("Fråga två"), false);
      assert.equal(text.includes('"lookup"'), false);
    });
  });
}

describe("OpenAI adapter", () => {
  test("stores nothing at OpenAI and asks for replayable reasoning", async () => {
    const h = openAiHarness();
    const session = open(h);
    session.addUserMessage("Hej");
    await run(session);
    assert.equal(h.requests[0].store, false);
    assert.deepEqual(h.requests[0].include, ["reasoning.encrypted_content"]);
  });

  test("sends an effort only when one is set", async () => {
    const without = openAiHarness();
    const first = open(without);
    first.addUserMessage("Hej");
    await run(first);
    assert.equal("reasoning" in without.requests[0], false);

    const withEffort = openAiHarness({ effort: "none" });
    const second = open(withEffort);
    second.addUserMessage("Hej");
    await run(second);
    assert.deepEqual(withEffort.requests[0].reasoning, { effort: "none" });
  });

  test("a failed response rejects", async () => {
    const client = {
      responses: {
        create: async () =>
          (async function* () {
            yield {
              type: "response.failed",
              response: { error: { message: "Boom" } },
            };
          })(),
      },
    };
    const session = createOpenAiProvider({
      client: client as unknown as OpenAI,
      model: "m",
    }).createSession({ system: "", tools: [] });
    session.addUserMessage("Hej");
    await assert.rejects(run(session), /Boom/);
  });

  test("a stream that ends without a result rejects", async () => {
    const client = {
      responses: { create: async () => (async function* () {})() },
    };
    const session = createOpenAiProvider({
      client: client as unknown as OpenAI,
      model: "m",
    }).createSession({ system: "", tools: [] });
    session.addUserMessage("Hej");
    await assert.rejects(run(session), /without a result/);
  });
});

describe("Anthropic adapter", () => {
  test("defaults to Opus 5.5, adaptive thinking and low effort", async () => {
    const h = anthropicHarness();
    const session = open(h);
    session.addUserMessage("Hej");
    await run(session);

    const [request] = h.requests;
    assert.equal(request.model, "claude-opus-5-5");
    assert.deepEqual(request.thinking, { type: "adaptive" });
    assert.deepEqual(request.output_config, { effort: "low" });
  });

  test("never forces a tool", async () => {
    const h = anthropicHarness();
    const session = open(h);
    session.addUserMessage("Hej");
    await run(session);
    assert.equal("tool_choice" in h.requests[0], false);
  });

  test("marks the stable prefix and the conversation for caching", async () => {
    const h = anthropicHarness();
    const session = open(h);
    session.addUserMessage("Hej");
    await run(session);

    const [request] = h.requests;
    const [system] = request.system as Array<{ cache_control: unknown }>;
    assert.deepEqual(system.cache_control, { type: "ephemeral" });
    assert.deepEqual(request.cache_control, { type: "ephemeral" });
  });

  test("uses server-side fallbacks where the model has them", async () => {
    const h = anthropicHarness();
    const session = open(h);
    session.addUserMessage("Hej");
    await run(session);
    assert.equal(h.requests[0].fallbacks, "default");
    assert.deepEqual(h.requests[0].betas, ["server-side-fallback-2026-07-01"]);

    const other = anthropicHarness({ model: "claude-haiku-5-5" });
    const second = open(other);
    second.addUserMessage("Hej");
    await run(second);
    assert.equal("fallbacks" in other.requests[0], false);
  });

  test("sends all tool results in one message, with error flags", async () => {
    const h = anthropicHarness();
    h.queue({
      calls: [
        { id: "a", name: "lookup", input: { word: "x" } },
        { id: "b", name: "lookup", input: { word: "y" } },
      ],
    });
    const session = open(h);
    session.addUserMessage("Hej");
    await run(session);
    session.addToolResults([
      { callId: "a", content: "ok", isError: false },
      { callId: "b", content: "fail", isError: true },
    ]);
    await run(session);

    const last = h.sentHistory().at(-1) as {
      role: string;
      content: Array<{ tool_use_id: string; is_error: boolean }>;
    };
    assert.equal(last.role, "user");
    assert.deepEqual(
      last.content.map((c) => [c.tool_use_id, c.is_error]),
      [
        ["a", false],
        ["b", true],
      ]
    );
  });
});
