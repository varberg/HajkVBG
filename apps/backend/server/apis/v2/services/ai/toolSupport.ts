export const PAGE_SIZE = 25;

// The same answer for something that doesn't exist and something the user can't
// reach, so that a rejection never confirms that a restricted layer is there.
export const NOT_FOUND = "Unknown id.";

/** An error meant for the model, which can correct itself and try again. */
export class ToolError extends Error {}

export function readOffset(offset: number | null): number {
  if (offset !== null && offset < 0) {
    throw new ToolError("offset can't be negative.");
  }
  return offset ?? 0;
}
