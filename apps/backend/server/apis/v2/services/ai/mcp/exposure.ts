/**
 * What of an MCP server's results may reach the model. The chat runs on cloud
 * models, so a server with sensitive data must keep its results in the browser.
 * - `model`: the result, or a slimmed view of it, goes to the model.
 * - `client`: the model only learns that something was shown. The result goes
 *   to the browser alone, and is never put in the history or logged.
 */
export type Exposure = "model" | "client";

/** The one error text the model gets from a `client` server. */
export const HIDDEN_ERROR = "The tool failed.";

/**
 * @summary Fails closed: anything but an explicit `model` means `client`, so a
 * server that someone adds without thinking about it can't leak.
 */
export const readExposure = (value: string | undefined): Exposure =>
  value?.trim().toLowerCase() === "model" ? "model" : "client";

/**
 * @summary The only way an MCP result reaches the model. Every bridged tool
 * passes its result through here.
 * @param view What the model may see with `model` exposure
 */
export function toModelContent(
  exposure: Exposure,
  view: Record<string, unknown>,
  resultId: string | null
): Record<string, unknown> {
  if (exposure === "model") {
    return resultId === null ? view : { ...view, resultId };
  }
  return resultId === null ? { shown: true } : { resultId, shown: true };
}
