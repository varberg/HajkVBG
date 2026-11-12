import type { ChatMessage, ChatState } from "./types";

export const EMPTY_STATE: ChatState = {
  messages: [],
  running: false,
  activeTool: null,
  includeDrawn: false,
};

/**
 * @summary The state of the chat, which the view reads through
 * `useSyncExternalStore`.
 */
export class ChatStore {
  #state: ChatState = EMPTY_STATE;
  #listeners = new Set<() => void>();
  #nextMessageId = 1;
  #notifyScheduled = false;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getState = (): ChatState => this.#state;

  update = (state: Partial<ChatState>): void => {
    this.#state = { ...this.#state, ...state };
    this.#scheduleNotify();
  };

  updateMessage = (
    id: number,
    update: (message: ChatMessage) => Partial<ChatMessage>
  ): void => {
    this.update({
      messages: this.#state.messages.map((message) =>
        message.id === id ? { ...message, ...update(message) } : message
      ),
    });
  };

  /** Add a notice under an answer, once. */
  addNotice = (answerId: number, notice: string): void => {
    this.updateMessage(answerId, ({ notices }) => ({
      notices: notices.includes(notice) ? notices : [...notices, notice],
    }));
  };

  createMessage(role: ChatMessage["role"], text: string): ChatMessage {
    return {
      id: this.#nextMessageId++,
      role,
      text,
      drawnShared: 0,
      layers: [],
      routes: [],
      routesShownId: null,
      download: null,
      notices: [],
      error: null,
      stopped: false,
    };
  }

  /**
   * @summary Tell the view once per frame, not once per event.
   * @description One network chunk can hold hundreds of text events, read one
   * microtask after another. Each update of an external store renders at once,
   * so React would see that as an update loop and throw "Maximum update depth
   * exceeded", which ended the answer.
   */
  #scheduleNotify(): void {
    if (this.#notifyScheduled) {
      return;
    }
    this.#notifyScheduled = true;
    requestAnimationFrame(() => {
      this.#notifyScheduled = false;
      this.#listeners.forEach((listener) => listener());
    });
  }
}
