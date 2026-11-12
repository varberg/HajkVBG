export const PAGE_SIZE = 25;

// The same answer for something that doesn't exist and something the user can't
// reach, so that a rejection never confirms that a restricted layer is there.
export const NOT_FOUND = "Unknown id.";

/** Why one of several ids was left out, for the model. */
export interface Rejection {
  id: string;
  reason: string;
}

/** The longest label the model may give a place, such as a route's start. */
export const MAX_LABEL = 100;

/** An error meant for the model, which can correct itself and try again. */
export class ToolError extends Error {}

export function readOffset(offset: number): number {
  if (offset < 0) {
    throw new ToolError("offset can't be negative.");
  }
  return offset;
}
