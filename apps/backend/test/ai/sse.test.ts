import { describe, test } from "node:test";
import assert from "node:assert/strict";

// The client has no test runner, and this file has no dependencies. A computed
// path keeps Backend's typecheck out of the client's code.
const sse = new URL(
  "../../../client/src/plugins/AiChat/sse.ts",
  import.meta.url
);
const { readEvents } = (await import(sse.href)) as {
  readEvents: (
    body: ReadableStream<Uint8Array>
  ) => AsyncGenerator<{ event: string; data: string }>;
};

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function split(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += size) {
    chunks.push(bytes.subarray(start, start + size));
  }
  return chunks;
}

async function collect(body: ReadableStream<Uint8Array>) {
  const messages = [];
  for await (const message of readEvents(body)) {
    messages.push(message);
  }
  return messages;
}

describe("readEvents", () => {
  test("puts a large event together from many chunks", async () => {
    // About the size of show_features for 250 detaljplaner. The odd chunk size
    // also splits the two bytes of å, ä and ö.
    const payload = JSON.stringify({ text: "åäö".repeat(200_000) });
    const bytes = new TextEncoder().encode(
      `event: start\ndata: {}\n\nevent: action\ndata: ${payload}\n\nevent: done\ndata: {}\n\n`
    );
    assert.ok(bytes.length > 1_000_000);

    const messages = await collect(streamOf(split(bytes, 16_381)));

    assert.deepEqual(
      messages.map(({ event }) => event),
      ["start", "action", "done"]
    );
    assert.equal(messages[1].data, payload);
  });

  test("handles an event split inside its separator", async () => {
    const bytes = new TextEncoder().encode("event: a\ndata: 1\n\ndata: 2\n\n");
    const messages = await collect(streamOf(split(bytes, 1)));

    assert.deepEqual(messages, [
      { event: "a", data: "1" },
      { event: "message", data: "2" },
    ]);
  });
});
