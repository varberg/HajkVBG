import { hfetch } from "../../utils/FetchWrapper";

import { ERRORS, REQUEST_ERRORS } from "./constants";
import { readEvents } from "./sse";
import type { ChatEvent, SharedDrawing } from "./types";

export interface TurnRequest {
  url: string;
  map: string;
  conversationId: string | null;
  message: string;
  mapState: {
    layers: Array<{ id: string; visibleSubLayers: string[] }>;
    background: string | null;
    drawn: SharedDrawing[];
  };
  signal: AbortSignal;
}

/** @summary Ask a question, in a new conversation if `conversationId` is null. */
export const postTurn = ({
  url,
  signal,
  ...body
}: TurnRequest): Promise<Response> =>
  hfetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(body),
  });

/** The code of an error response. It can only be read once. */
export async function readErrorCode(
  response: Response
): Promise<string | null> {
  if (response.ok) {
    return null;
  }
  const body = await response.json().catch(() => null);
  return body?.details?.code ?? "";
}

export function requestErrorText(status: number, code: string | null): string {
  if (code && REQUEST_ERRORS[code]) {
    return REQUEST_ERRORS[code];
  }
  // These two don't come from the chat itself, so they have no code
  if (status === 403) {
    return ERRORS.forbidden;
  }
  return status === 429 ? ERRORS.tooMany : ERRORS.generic;
}

/** @summary The events of an answer, as they arrive. */
export async function* readChatEvents(
  response: Response
): AsyncGenerator<ChatEvent> {
  for await (const { event, data } of readEvents(response.body!)) {
    yield { ...JSON.parse(data), type: event } as ChatEvent;
  }
}
