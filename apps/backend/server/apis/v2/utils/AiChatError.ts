export type AiChatErrorCode =
  | "not_enabled"
  | "unavailable"
  | "invalid_request"
  | "map_not_found"
  | "conversation_lost"
  | "turn_running"
  | "daily_limit";

/**
 * @summary An error that stops a chat request before it starts streaming. The
 * code lets the client tell the cases apart, for example to start a new
 * conversation when one is lost.
 */
export class AiChatError extends Error {
  statusCode: number;
  code: AiChatErrorCode;

  constructor(code: AiChatErrorCode, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }

  get name() {
    return "AiChatError";
  }

  /** handleStandardResponse passes this on in the response. */
  get details() {
    return { code: this.code };
  }
}
