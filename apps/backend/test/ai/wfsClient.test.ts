import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  WfsClient,
  WfsError,
} from "../../server/apis/v2/services/ai/features/wfsClient.ts";

const target = {
  url: "https://secret.example.com/wfs",
  typeName: "ws:adress",
  geometryField: "geom",
  srsName: "EPSG:3007",
  searchFields: ["sok"],
};

const options = { filter: "", sort: null, count: 250 };
const signal = new AbortController().signal;

const collection = {
  type: "FeatureCollection",
  features: [{ type: "Feature", id: "a.1", geometry: null, properties: {} }],
  numberMatched: 7,
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    ...init,
  });

const clientWith = (fetch: typeof globalThis.fetch, timeoutMs = 1000) =>
  new WfsClient({ timeoutMs, fetch });

const answering = (response: Response) => clientWith(async () => response);

const assertSafeFailure = async (client: WfsClient) => {
  await assert.rejects(client.query(target, options, signal), (error) => {
    assert.ok(error instanceof WfsError);
    assert.equal(error.message, "The source can't be reached right now.");
    return true;
  });
};

describe("WfsClient", () => {
  test("gives the features and the number of matches", async () => {
    const result = await answering(json(collection)).query(
      target,
      options,
      signal
    );
    assert.deepEqual(result, {
      features: collection.features,
      total: 7,
    });
  });

  test("posts the query, and refuses redirects", async () => {
    let url: unknown;
    let init: RequestInit | undefined;
    const client = clientWith(async (input, requestInit) => {
      url = input;
      init = requestInit;
      return json(collection);
    });

    await client.query(target, options, signal);

    assert.equal(url, target.url);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.match(init?.body as string, /outputFormat="application\/json"/);
    assert.match(init?.body as string, /typeNames="ws:adress"/);
    assert.match(init?.body as string, /srsName="EPSG:3007"/);
  });

  test("reads the total of a count, which has no features", async () => {
    const result = await answering(
      json({ ...collection, features: [], numberMatched: 32220 })
    ).query(target, { ...options, count: 0 }, signal);
    assert.equal(result.total, 32220);
  });

  test("gives the safe error on a redirect", async () => {
    await assertSafeFailure(
      clientWith(async () => {
        throw new TypeError(`fetch failed: redirect from ${target.url}`);
      })
    );
  });

  test("gives the safe error when the source can't be reached", async () => {
    await assertSafeFailure(
      clientWith(async () => {
        throw new TypeError("getaddrinfo ENOTFOUND secret.example.com");
      })
    );
  });

  test("gives the safe error on an answer that isn't JSON", async () => {
    await assertSafeFailure(
      answering(
        new Response(
          "<ows:ExceptionReport>Secret detail</ows:ExceptionReport>",
          {
            headers: { "Content-Type": "text/xml" },
          }
        )
      )
    );
  });

  test("gives the safe error on a login page", async () => {
    await assertSafeFailure(
      answering(
        new Response("<html>Sign in</html>", {
          headers: { "Content-Type": "text/html" },
        })
      )
    );
  });

  test("gives the safe error on an error status", async () => {
    await assertSafeFailure(answering(json(collection, { status: 500 })));
  });

  test("gives the safe error on broken JSON", async () => {
    await assertSafeFailure(
      answering(
        new Response("{ not json", {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
  });

  test("gives the safe error on JSON that is no feature collection", async () => {
    await assertSafeFailure(answering(json({ exceptions: [] })));
    await assertSafeFailure(answering(json({ features: [] })));
    await assertSafeFailure(
      answering(json({ features: [], numberMatched: "unknown" }))
    );
  });

  test("stops reading an oversized response, and gives the safe error", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });

    await assertSafeFailure(
      answering(
        new Response(body, { headers: { "Content-Type": "application/json" } })
      )
    );
    assert.equal(cancelled, true);
    assert.ok(sent < 20, `read ${sent} MB`);
  });

  test("reads a large response that arrives in chunks", async () => {
    const text = JSON.stringify({
      ...collection,
      features: [
        { type: "Feature", properties: { namn: "å".repeat(200_000) } },
      ],
    });
    const bytes = new TextEncoder().encode(text);
    const size = 1001; // Odd, to cut through the two bytes of an å
    const body = new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size) {
          controller.enqueue(bytes.slice(i, i + size));
        }
        controller.close();
      },
    });

    const { features } = await answering(
      new Response(body, { headers: { "Content-Type": "application/json" } })
    ).query(target, options, signal);

    assert.equal(features[0].properties?.namn, "å".repeat(200_000));
  });

  const hanging: typeof globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason)
      );
    });

  test("gives the safe error on a timeout", async () => {
    await assertSafeFailure(clientWith(hanging, 5));
  });

  test("passes on the abort of the turn, which isn't a source failure", async () => {
    const controller = new AbortController();
    const reason = new Error("Turn aborted");
    const query = clientWith(hanging).query(target, options, controller.signal);
    controller.abort(reason);
    await assert.rejects(query, (error) => error === reason);
  });
});
