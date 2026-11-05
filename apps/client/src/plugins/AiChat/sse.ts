export interface SseMessage {
  event: string;
  data: string;
}

function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }
  // A block without data is a keep-alive comment
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/**
 * @summary Read server-sent events from a response body. `EventSource` can't be
 * used, as it only makes GET requests.
 * @description A network chunk can end anywhere, also inside a character or an
 * event, so whatever isn't a complete event yet waits for the next chunk.
 */
export async function* readEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const message = parseBlock(block);
        if (message !== null) {
          yield message;
        }
      }
    }
  } finally {
    // Whoever stops reading early must not leave the model running in Backend
    reader.cancel().catch(() => {});
  }
}
