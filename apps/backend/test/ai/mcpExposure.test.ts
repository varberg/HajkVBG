import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import log4js from "log4js";

import { buildUserCatalog } from "../../server/apis/v2/services/ai/access.service.ts";
import {
  buildCatalog,
  walkMapConfig,
} from "../../server/apis/v2/services/ai/catalog.service.ts";
import {
  HIDDEN_ERROR,
  readExposure,
} from "../../server/apis/v2/services/ai/mcp/exposure.ts";
import type { Exposure } from "../../server/apis/v2/services/ai/mcp/exposure.ts";
import type {
  McpCallResult,
  McpToolInfo,
} from "../../server/apis/v2/services/ai/mcp/mcpClient.ts";
import {
  bridgeTool,
  callMcp,
} from "../../server/apis/v2/services/ai/mcp/mcpTools.ts";
import type { McpServer } from "../../server/apis/v2/services/ai/mcp/mcpTools.ts";
import { readMcpExtensions } from "../../server/apis/v2/services/ai/mcp/servers/index.ts";
import { ToolError } from "../../server/apis/v2/services/ai/toolSupport.ts";
import { Orchestrator } from "../../server/apis/v2/services/ai/orchestrator.ts";
import type { ChatEvent } from "../../server/apis/v2/services/ai/orchestrator.ts";
import type {
  ChatProvider,
  ModelTurn,
} from "../../server/apis/v2/services/ai/providers/types.ts";
import { createRegistry } from "../../server/apis/v2/services/ai/tools.ts";
import { layersStore, mapConfig } from "./fixtures.ts";

const CANARY = "PERSONNUMMER-19121212-1212";

// Everything that is logged, to check that the canary never is
const logged: string[] = [];
log4js.configure({
  appenders: {
    memory: {
      type: {
        configure: () => (event: log4js.LoggingEvent) =>
          logged.push(event.data.map(String).join(" ")),
      },
    },
  },
  categories: { default: { appenders: ["memory"], level: "all" } },
});

const TOOL: McpToolInfo = {
  name: "lookup_person",
  description: `Looks up ${CANARY}.`,
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

type Answer = () => Partial<McpCallResult> | Promise<never>;

const server = (exposure: Exposure, answer: Answer) => ({
  name: "secret",
  exposure,
  connection: {
    listTools: async () => [TOOL],
    getInstructions: async () => null,
    async call(): Promise<McpCallResult> {
      const result = await answer();
      return { structured: null, text: "", isError: false, ...result };
    },
  },
});

const NO_USAGE = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

/** A provider that calls the tool once, and records all it's given. */
function recordingProvider() {
  const seen: unknown[] = [];
  const turns: ModelTurn[] = [
    {
      text: "",
      toolCalls: [{ id: "1", name: TOOL.name, input: { query: "x" } }],
      stopReason: "tool_calls",
      usage: NO_USAGE,
    },
    { text: "Klart", toolCalls: [], stopReason: "end", usage: NO_USAGE },
  ];
  const provider: ChatProvider = {
    id: "fake:model",
    createSession(options) {
      seen.push(options);
      return {
        addUserMessage: (message) => seen.push(message),
        addToolResults: (results) => seen.push(results),
        commit() {},
        rollback() {},
        async run() {
          return turns.shift()!;
        },
      };
    },
  };
  return { provider, seen };
}

/** Run one turn in which the model calls the tool of a `client` server. */
async function turnWith(answer: Answer) {
  const tool = bridgeTool({
    server: server("client", answer),
    tool: TOOL,
    description: "Looks up a person for the user.",
  });
  const registry = createRegistry([
    {
      name: "secret",
      load: async () => ({ tools: [tool], prompt: "Secret." }),
    },
  ]);
  const { provider, seen } = recordingProvider();
  const chat = new Orchestrator({
    provider,
    registry,
    limits: {
      maxIterations: 4,
      turnTimeoutMs: 5_000,
      turnMaxTokens: 1_000,
      maxLayersOn: 25,
      dailyMaxTurns: 0,
      maxConversations: 0,
      conversationTtlMs: 60_000,
    },
    search: { search: async () => ({ hits: [], mode: "keyword" }) },
    wfs: {
      connectionOf: async () => undefined,
      query: () => Promise.reject(new Error("No source.")),
    },
    access: {
      getUserCatalog: async () =>
        buildUserCatalog(
          buildCatalog("demo", mapConfig(), layersStore()),
          walkMapConfig(mapConfig())
        ),
    },
  });
  const events: ChatEvent[] = [];
  const turn = await chat.beginTurn({
    map: "demo",
    user: undefined,
    conversationId: null,
    message: "Hej",
    mapState: { layers: [], background: null },
  });
  await chat.runTurn(
    turn,
    (event) => events.push(event),
    new AbortController().signal
  );
  return { modelSaw: JSON.stringify(seen), events };
}

describe("readExposure", () => {
  test("only an explicit `model` lets results reach the model", () => {
    assert.equal(readExposure("model"), "model");
    assert.equal(readExposure(" MODEL "), "model");
    for (const value of [undefined, "", "yes", "client", "modell"]) {
      assert.equal(readExposure(value), "client");
    }
  });
});

describe("a server with client exposure", () => {
  test("needs a description from Hajk, as its own never reaches the model", () => {
    assert.throws(() =>
      bridgeTool({ server: server("client", () => ({})), tool: TOOL })
    );
  });

  test("sends its result to the browser and never to the model", async () => {
    logged.length = 0;
    const { modelSaw, events } = await turnWith(() => ({
      structured: { name: CANARY },
      text: JSON.stringify({ name: CANARY }),
    }));
    assert.ok(modelSaw.includes("Secret."), "the prompt section is used");
    assert.ok(modelSaw.includes('\\"shown\\":true'));
    assert.ok(!modelSaw.includes(CANARY));
    assert.ok(!logged.join("\n").includes(CANARY));

    const shown = events.find((e) => e.type === "mcp_result");
    assert.ok(shown?.type === "mcp_result");
    assert.equal(shown.result.name, CANARY);
  });

  test("keeps the server's error text from the model and the log", async () => {
    logged.length = 0;
    const { modelSaw } = await turnWith(() => ({
      isError: true,
      text: `No access to ${CANARY}`,
    }));
    assert.ok(modelSaw.includes(HIDDEN_ERROR));
    assert.ok(!modelSaw.includes(CANARY));
    assert.ok(!logged.join("\n").includes(CANARY));
  });

  test("keeps a failed call's message from the model and the log", async () => {
    logged.length = 0;
    const { modelSaw } = await turnWith(() =>
      Promise.reject(new Error(`Timed out looking up ${CANARY}`))
    );
    assert.ok(!modelSaw.includes(CANARY));
    assert.ok(!logged.join("\n").includes(CANARY));
    assert.ok(logged.some((line) => line.includes('"lookup_person" failed')));
  });
});

describe("readMcpExtensions", () => {
  test("turns off a server with client exposure, as the browser can't show its results yet", () => {
    const names = ["URL", "TOKEN", "EXPOSURE"].map(
      (n) => `AI_ROUTING_MCP_${n}`
    );
    const saved = names.map((name) => process.env[name]);
    Object.assign(process.env, {
      AI_ROUTING_MCP_URL: "http://127.0.0.1:1/mcp",
      AI_ROUTING_MCP_TOKEN: "token",
      AI_ROUTING_MCP_EXPOSURE: "client",
    });
    try {
      assert.deepEqual(readMcpExtensions(), []);
      assert.ok(
        logged.some((line) => line.includes("can't show such results yet"))
      );
    } finally {
      names.forEach((name, i) => {
        if (saved[i] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = saved[i];
        }
      });
    }
  });
});

describe("a server that is down", () => {
  const signal = new AbortController().signal;

  function downServer(failure: () => Error = () => new Error("timed out")) {
    let up = false;
    let calls = 0;
    const down: McpServer = {
      name: "secret",
      exposure: "model",
      connection: {
        listTools: async () => [TOOL],
        getInstructions: async () => null,
        async call(): Promise<McpCallResult> {
          calls += 1;
          if (!up) {
            throw failure();
          }
          return { structured: { ok: true }, text: "", isError: false };
        },
      },
    };
    return {
      server: down,
      calls: () => calls,
      bringUp: () => (up = true),
    };
  }

  test("fails at once for a minute after every attempt failed", async () => {
    let now = 0;
    const { server: down, calls } = downServer();
    await assert.rejects(
      callMcp(down, TOOL.name, {}, signal, () => now),
      ToolError
    );
    assert.equal(calls(), 2);
    now = 59_999;
    await assert.rejects(
      callMcp(down, TOOL.name, {}, signal, () => now),
      ToolError
    );
    assert.equal(calls(), 2);
  });

  test("counts a timeout from the SDK as down", async () => {
    const { server: down, calls } = downServer(
      () => new McpError(ErrorCode.RequestTimeout, "Request timed out")
    );
    await assert.rejects(callMcp(down, TOOL.name, {}, signal, () => 0));
    await assert.rejects(callMcp(down, TOOL.name, {}, signal, () => 1));
    assert.equal(calls(), 2);
  });

  test("isn't down after an error answer, which only the call failed", async () => {
    const { server: up, calls } = downServer(
      () => new McpError(ErrorCode.InvalidParams, "Invalid arguments")
    );
    await assert.rejects(callMcp(up, TOOL.name, {}, signal, () => 0));
    assert.equal(up.downUntil, undefined);
    await assert.rejects(callMcp(up, TOOL.name, {}, signal, () => 1));
    assert.equal(calls(), 4);
  });

  test("is tried again after the minute", async () => {
    let now = 0;
    const { server: down, calls } = downServer();
    await assert.rejects(callMcp(down, TOOL.name, {}, signal, () => now));
    now = 60_000;
    await assert.rejects(callMcp(down, TOOL.name, {}, signal, () => now));
    assert.equal(calls(), 4);
  });

  test("is trusted again after a call that works", async () => {
    let now = 0;
    const { server: down, calls, bringUp } = downServer();
    await assert.rejects(callMcp(down, TOOL.name, {}, signal, () => now));
    now = 60_000;
    bringUp();
    assert.deepEqual(await callMcp(down, TOOL.name, {}, signal, () => now), {
      ok: true,
    });
    assert.equal(down.downUntil, undefined);
    assert.equal(calls(), 3);
  });
});
