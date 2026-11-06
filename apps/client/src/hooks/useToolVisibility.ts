import { useSyncExternalStore, useCallback } from "react";

import type ToolControlModel from "../models/ToolControlModel";

/**
 * Subscribe to whether a tool is open, and re-render whenever that changes, no
 * matter who opened or closed it.
 *
 * @param toolControl The app's `toolControl`
 * @param id A tool id, see ToolControlModel
 * @returns Whether the tool is open
 */
export function useToolVisibility(
  toolControl: ToolControlModel,
  id: string
): boolean {
  const subscribe = useCallback(
    (callback: () => void) => toolControl.subscribe(id, callback),
    [toolControl, id]
  );
  const getSnapshot = useCallback(
    () => toolControl.getVisibilitySnapshot(id),
    [toolControl, id]
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}
