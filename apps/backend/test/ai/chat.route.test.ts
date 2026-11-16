import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

// @ts-expect-error The package has no types, and this is the only typed use of it
import compression from "compression";
import express from "express";
import * as OpenApiValidator from "express-openapi-validator";

import { createChatHandler } from "../../server/apis/v2/controllers/ai/controller.ts";
import type {
  ChatEvent,
  Orchestrator,
} from "../../server/apis/v2/services/ai/orchestrator.ts";
import { AccessError } from "../../server/apis/v2/utils/AccessError.js";
import { AiChatError } from "../../server/apis/v2/utils/AiChatError.ts";

const body = {
  map: "demo",
  conversationId: null,
  message: "Hej",
  mapState: { layers: [], background: null },
};

type RunTurn = (
  emit: (event: ChatEvent) => void,
  signal: AbortSignal
) => Promise<void>;

const fakeChat = (
  runTurn: RunTurn,
  beginTurn: () => Promise<unknown> = async () => ({})
) =>
  ({
    beginTurn,
    runTurn: (_turn: unknown, emit: (e: ChatEvent) => void, s: AbortSignal) =>
      runTurn(emit, s),
  }) as unknown as Orchestrator;

async function serve(handler: express.RequestHandler, useSpec = false) {
  const app = express();
  app.use(compression());
  app.use(express.json());
  if (useSpec) {
    app.use(
      OpenApiValidator.middleware({
        apiSpec: path.join(process.cwd(), "server/common/api.v2.yml"),
        validateRequests: { allowUnknownQueryParameters: true },
        ignoreUndocumented: true,
      })
    );
  }
  app.post("/api/v2/ai/chat", handler);
  app.use(
    (
      error: { status?: number; message: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(error.status ?? 500).json({ error: error.message });
    }
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/api/v2/ai/chat` };
}

const post = (url: string, payload: unknown = body, signal?: AbortSignal) =>
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify(payload),
    signal,
  });

describe("POST /ai/chat", () => {
  test("streams events as they happen, also with compression on", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const handler = createChatHandler(
      async () =>
        fakeChat(async (emit) => {
          emit({ type: "start", conversationId: "abc" });
          await gate;
          emit({ type: "done", truncated: false });
        }),
      () => true
    );
    const { server, url } = await serve(handler);

    const response = await post(url);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^text\/event-stream/
    );
    assert.equal(
      response.headers.get("cache-control"),
      "no-cache, no-transform"
    );
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    assert.equal(response.headers.get("content-encoding"), null);

    // The first event arrives while the turn is still waiting at the gate
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.equal(
      new TextDecoder().decode(first.value),
      'event: start\ndata: {"conversationId":"abc"}\n\n'
    );

    release();
    const rest = await new Response(
      new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
      })
    ).text();
    assert.equal(rest, 'event: done\ndata: {"truncated":false}\n\n');

    server.close();
  });

  test("a client that disconnects aborts the turn", async () => {
    let aborted: () => void;
    const wasAborted = new Promise<void>((resolve) => (aborted = resolve));
    const handler = createChatHandler(
      async () =>
        fakeChat(async (emit, signal) => {
          emit({ type: "start", conversationId: "abc" });
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve())
          );
          aborted();
        }),
      () => true
    );
    const { server, url } = await serve(handler);

    const client = new AbortController();
    const response = await post(url, body, client.signal);
    await response.body!.getReader().read();
    client.abort();

    await wasAborted;
    server.close();
  });

  test("a client that leaves before the stream starts aborts the turn", async () => {
    const client = new AbortController();
    let signalOfTurn: AbortSignal | null = null;
    let ran: () => void;
    const turnRan = new Promise<void>((resolve) => (ran = resolve));
    const handler = createChatHandler(
      async () =>
        fakeChat(
          async (_emit, signal) => {
            signalOfTurn = signal;
            ran();
          },
          // The client goes away while the turn is still being set up
          async () => {
            client.abort();
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {};
          }
        ),
      () => true
    );
    const { server, url } = await serve(handler);

    await assert.rejects(post(url, body, client.signal));
    await turnRan;
    assert.equal(signalOfTurn!.aborted, true);
    server.close();
  });

  const statusOf = async (handler: express.RequestHandler, payload = body) => {
    const { server, url } = await serve(handler);
    const response = await post(url, payload);
    const json = (await response.json()) as { details: { code: string } };
    server.close();
    return { status: response.status, json };
  };

  test("is a plain 404 when the chat is off", async () => {
    let loaded = false;
    const { status, json } = await statusOf(
      createChatHandler(
        async () => {
          loaded = true;
          return fakeChat(async () => {});
        },
        () => false
      )
    );
    assert.equal(status, 404);
    assert.equal(json.details.code, "not_enabled");
    assert.equal(loaded, false);
  });

  test("a missing provider gives a 503", async () => {
    const { status, json } = await statusOf(
      createChatHandler(
        () =>
          Promise.reject(new AiChatError("unavailable", 503, "No key is set.")),
        () => true
      )
    );
    assert.equal(status, 503);
    assert.equal(json.details.code, "unavailable");
  });

  test("errors before the stream are plain HTTP errors", async () => {
    for (const [code, statusCode] of [
      ["conversation_lost", 404],
      ["turn_running", 409],
      ["daily_limit", 429],
    ] as const) {
      const { status, json } = await statusOf(
        createChatHandler(
          async () =>
            fakeChat(
              async () => {},
              () => Promise.reject(new AiChatError(code, statusCode, "Stop"))
            ),
          () => true
        )
      );
      assert.equal(status, statusCode);
      assert.equal(json.details.code, code);
    }
  });

  for (const [name, payload] of [
    ["a blank message", { ...body, message: "   " }],
    ["a message over the limit", { ...body, message: "x".repeat(4001) }],
    ["a missing map", { ...body, map: undefined }],
    ["a conversation id of the wrong type", { ...body, conversationId: 1 }],
  ]) {
    test(`${name} is refused without starting a turn`, async () => {
      let started = false;
      const { status, json } = await statusOf(
        createChatHandler(
          async () =>
            fakeChat(
              async () => {},
              async () => {
                started = true;
                return {};
              }
            ),
          () => true
        ),
        payload as typeof body
      );
      assert.equal(status, 400);
      assert.equal(json.details.code, "invalid_request");
      assert.equal(started, false);
    });
  }

  const failingBeginTurn = (error: Error) =>
    createChatHandler(
      async () =>
        fakeChat(
          async () => {},
          () => Promise.reject(error)
        ),
      () => true
    );

  test("a missing map doesn't reveal any file path", async () => {
    const error = Object.assign(new Error("ENOENT: /srv/App_Data/x.json"), {
      code: "ENOENT",
    });
    const { status, json } = await statusOf(failingBeginTurn(error));
    assert.equal(status, 404);
    assert.equal(json.details.code, "map_not_found");
    assert.equal(JSON.stringify(json).includes("/srv"), false);
  });

  test("an unexpected error doesn't reveal its message", async () => {
    const { status, json } = await statusOf(
      failingBeginTurn(new Error("Bad JSON in /srv/App_Data/map.json"))
    );
    assert.equal(status, 500);
    assert.equal(JSON.stringify(json).includes("/srv"), false);
  });

  test("masks personal numbers before the turn begins", async () => {
    let received: unknown;
    const handler = createChatHandler(
      async () =>
        fakeChat(
          async (emit) => emit({ type: "done", truncated: false }),
          async (...args: unknown[]) => {
            received = args[0];
            return {};
          }
        ),
      () => true
    );
    const { server, url } = await serve(handler);
    const response = await post(url, {
      ...body,
      message: "Jag heter 19791027-5934",
    });
    await response.text();
    assert.equal(
      (received as { message: string }).message,
      "Jag heter xxxxxxxx-xxxx"
    );
    server.close();
  });

  test("an access error keeps its status", async () => {
    const { status } = await statusOf(failingBeginTurn(new AccessError("No")));
    assert.equal(status, 403);
  });
});

describe("the OpenAPI specification", () => {
  let server: http.Server;
  let url: string;

  before(async () => {
    const handler = createChatHandler(
      async () =>
        fakeChat(async (emit) => {
          emit({ type: "done", truncated: false });
        }),
      () => true
    );
    ({ server, url } = await serve(handler, true));
  });

  after(() => server.close());

  test("accepts a valid request", async () => {
    const response = await post(url, {
      ...body,
      conversationId: "6f1d8a4e-3f53-4c16-9f4e-1a2b3c4d5e6f",
      mapState: {
        layers: [{ id: "1", visibleSubLayers: ["a"] }],
        background: "-1",
      },
    });
    assert.equal(response.status, 200);
    await response.text();
  });

  for (const [name, payload] of [
    ["a message over the limit", { ...body, message: "x".repeat(4001) }],
    ["an empty message", { ...body, message: "" }],
    ["a missing map", { ...body, map: undefined }],
    ["a conversation id that isn't a uuid", { ...body, conversationId: "1" }],
    ["unknown properties", { ...body, history: [] }],
    ["a map state of the wrong shape", { ...body, mapState: { layers: "x" } }],
  ] as const) {
    test(`rejects ${name}`, async () => {
      const response = await post(url, payload);
      assert.equal(response.status, 400);
      await response.text();
    });
  }
});

describe("an install with the chat turned off", () => {
  test("never loads the AI packages", () => {
    const script = `
      import { registerHooks } from "node:module";
      const loaded = [];
      registerHooks({
        resolve(specifier, context, next) {
          if (/^(openai|minisearch|@anthropic-ai\\/sdk)/.test(specifier)) {
            loaded.push(specifier);
          }
          return next(specifier, context);
        },
      });
      await import("./server/apis/v2/router.js");
      console.log(JSON.stringify(loaded));
      process.exit(0);
    `;
    const { stdout, stderr, status } = spawnSync(
      process.execPath,
      ["--env-file=.env.example", "--input-type=module", "-e", script],
      { encoding: "utf-8", timeout: 30_000 }
    );
    assert.equal(status, 0, stderr);
    assert.deepEqual(JSON.parse(stdout.trim().split("\n").at(-1) ?? ""), []);
  });
});
