import type { EventObserver } from "react-event-observer";

/**
 * @summary Centralized, reusable API for opening and closing tools by id.
 *
 * @description A tool is a plugin with a window or a dialog of its own. The two
 * kinds are built differently (`BaseWindowPlugin` and `DialogWindowPlugin`), and
 * the `<type>.showWindow` events they listen to give no answer, so a tool that
 * isn't there fails silently. This model hides those differences behind one API
 * that can be used from anywhere (plugins, embedders via
 * `window.hajkPublicApi`, and React via the `useToolVisibility` hook) and that
 * tells whether it worked. It mirrors `LayerControlModel`.
 *
 * An id is the lowercase plugin type, such as `"sketch"`. A dialog with a `name`
 * option is addressed as `"infodialog.<name>"`.
 *
 * KNOWN LIMITATIONS / GAPS (please keep this list up to date):
 * 1. Only mounted windows and dialogs are tools. `search` and `commandpalette`
 *    have neither, so they are unknown here.
 * 2. A plugin that replaces its window through `custom.render` can't be shown,
 *    because nothing would appear. That is `location` as a control button.
 * 3. Showing a tool closes the other windows on its side, and all windows on
 *    mobile, the same as clicking its button. `hideOtherPluginWindows` can't turn
 *    that off, see `BaseWindowPlugin.showWindow`.
 * 4. Showing a tool never passes options on. Plugins that open each other with
 *    options, such as Sketch and AttributeEditor, still use `<type>.showWindow`.
 * 5. Only AiChat uses this so far. CommandPalette, RecentlyUsedPlugins and the
 *    URL hash handler still publish the events, which keep working.
 * 6. This model lives for the whole app lifetime (instantiated once via
 *    `AppModel.addToolControl()`). There is no `dispose()`.
 *
 * ============================================================================
 * EXAMPLES — all public methods (assume `const tc = appModel.toolControl` or
 * `window.hajkPublicApi.toolControl`).
 * ============================================================================
 *
 * // Lookup
 * tc.getVisibleToolIds();                          // -> ids of open tools
 * tc.isToolVisible("sketch");                      // -> boolean
 * tc.canShowTool("sketch");                        // -> boolean
 *
 * // Open and close. These return false if the tool can't be reached.
 * tc.showTool("sketch");                           // same as clicking its button
 * tc.hideTool("sketch");
 * tc.toggleTool("sketch");
 * tc.setToolVisibility("sketch", true);            // boolean form of show/hide
 *
 * // Follow a tool, no matter who opened or closed it
 * const off = tc.subscribe("sketch", () => {});    // -> unsubscribe fn
 * tc.getVisibilitySnapshot("sketch");              // -> boolean
 *
 * // React
 * const open = useToolVisibility(tc, "sketch");
 */

/** What this model needs from a BaseWindowPlugin */
interface ToolWindow {
  type: string;
  state: { windowVisible: boolean };
  props: { custom?: { render?: unknown } };
  handleButtonClick(): void;
  closeWindow(): void;
}

/** What this model needs from a DialogWindowPlugin */
interface ToolDialog {
  uniqueIdentifier: string;
  state: { dialogOpen: boolean };
  handleButtonClick(): void;
  closeWindow(): void;
}

interface ToolControlOptions {
  globalObserver: EventObserver;
  pluginManager: { windows: ToolWindow[]; dialogs: ToolDialog[] };
}

interface Tool {
  instance: ToolWindow | ToolDialog;
  visible: boolean;
  showable: boolean;
}

class ToolControlModel {
  #globalObserver: EventObserver;
  #pluginManager: ToolControlOptions["pluginManager"];

  constructor({ globalObserver, pluginManager }: ToolControlOptions) {
    this.#globalObserver = globalObserver;
    this.#pluginManager = pluginManager;
  }

  #getTool(id: string): Tool | undefined {
    const { windows, dialogs } = this.#pluginManager;

    const window = windows.find((w) => w.type === id);
    if (window !== undefined) {
      return {
        instance: window,
        visible: window.state.windowVisible,
        showable: typeof window.props.custom?.render !== "function",
      };
    }

    const dialog = dialogs.find((d) => d.uniqueIdentifier === id);
    return dialog === undefined
      ? undefined
      : { instance: dialog, visible: dialog.state.dialogOpen, showable: true };
  }

  /** @returns The ids of all open windows and dialogs */
  getVisibleToolIds(): string[] {
    const { windows, dialogs } = this.#pluginManager;
    return [
      ...windows.filter((w) => w.state.windowVisible).map((w) => w.type),
      ...dialogs
        .filter((d) => d.state.dialogOpen)
        .map((d) => d.uniqueIdentifier),
    ];
  }

  isToolVisible(id: string): boolean {
    return this.#getTool(id)?.visible === true;
  }

  /** @returns Whether `showTool` would show something */
  canShowTool(id: string): boolean {
    return this.#getTool(id)?.showable === true;
  }

  /**
   * @summary Open a tool, the same way as clicking its button. An open tool is
   * brought to the front.
   * @returns False if the tool can't be shown
   */
  showTool(id: string): boolean {
    const tool = this.#getTool(id);
    if (tool?.showable !== true) {
      return false;
    }
    tool.instance.handleButtonClick();
    return true;
  }

  /**
   * @summary Close a tool. Closing a closed tool does nothing, as plugins do
   * their cleanup when they close.
   * @returns False if the tool is unknown
   */
  hideTool(id: string): boolean {
    const tool = this.#getTool(id);
    if (tool === undefined) {
      return false;
    }
    if (tool.visible) {
      tool.instance.closeWindow();
    }
    return true;
  }

  toggleTool(id: string): boolean {
    return this.setToolVisibility(id, !this.isToolVisible(id));
  }

  setToolVisibility(id: string, visible: boolean): boolean {
    return visible ? this.showTool(id) : this.hideTool(id);
  }

  /**
   * @summary Get told when a tool opens or closes, no matter who did it.
   * @returns A function that ends the subscription
   */
  subscribe(id: string, callback: () => void): () => void {
    let visible = this.isToolVisible(id);
    const handle = this.#globalObserver.subscribe(
      "core.pluginVisibilityChanged",
      () => {
        const current = this.isToolVisible(id);
        if (current !== visible) {
          visible = current;
          callback();
        }
      }
    );
    return () => handle.unsubscribe();
  }

  /** A primitive, so it's safe to use with `useSyncExternalStore`. */
  getVisibilitySnapshot(id: string): boolean {
    return this.isToolVisible(id);
  }
}

export default ToolControlModel;
