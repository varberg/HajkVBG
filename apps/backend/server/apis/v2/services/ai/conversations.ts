import crypto from "crypto";

import { AiChatError } from "../../utils/AiChatError.ts";
import type { ProviderSession } from "./providers/types.ts";

export interface Conversation {
  readonly id: string;
  readonly map: string;
  readonly user: string | undefined;
  readonly session: ProviderSession;
  /** The map state as of the last committed turn. */
  lastMapState: string | null;
  /** Committed turns */
  turns: number;
  running: boolean;
}

interface ConversationStoreOptions {
  /** 0 means no limit */
  maxConversations: number;
  ttlMs: number;
  now?: () => number;
}

interface Entry {
  conversation: Conversation;
  expires: number;
}

/**
 * @summary The live conversations, in memory. History lives here and not in the
 * browser, so that a client can't inject fake assistant turns or tool results.
 * @description Entries are kept in order of last use, so the first ones are
 * always the oldest. On a public site with no login, all visitors are the same
 * `undefined` user, and the unguessable id is the only thing keeping them apart.
 * It must never be logged or put in a URL.
 */
export class ConversationStore {
  #entries = new Map<string, Entry>();
  #maxConversations: number;
  #ttlMs: number;
  #now: () => number;

  constructor({ maxConversations, ttlMs, now }: ConversationStoreOptions) {
    this.#maxConversations = maxConversations;
    this.#ttlMs = ttlMs;
    this.#now = now ?? Date.now;
  }

  get size(): number {
    return this.#entries.size;
  }

  /** @summary Add a conversation. The server always chooses the id. */
  create(
    map: string,
    user: string | undefined,
    session: ProviderSession
  ): Conversation {
    this.#removeExpired();
    if (this.#maxConversations > 0) {
      this.#makeRoom();
    }
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      map,
      user,
      session,
      lastMapState: null,
      turns: 0,
      running: false,
    };
    this.#entries.set(conversation.id, {
      conversation,
      expires: this.#now() + this.#ttlMs,
    });
    return conversation;
  }

  /**
   * @summary Find a conversation, bound to its map and user.
   * @throws {AiChatError} The same error in all cases, so that a caller can't
   * tell a conversation of someone else from one that doesn't exist.
   */
  get(id: string, map: string, user: string | undefined): Conversation {
    this.#removeExpired();
    const conversation = this.#entries.get(id)?.conversation;
    if (conversation?.map !== map || conversation.user !== user) {
      throw new AiChatError(
        "conversation_lost",
        404,
        "The conversation no longer exists. Start a new one."
      );
    }
    return conversation;
  }

  /** @summary Mark a conversation as used, which restarts its idle time. */
  touch(conversation: Conversation): void {
    this.#entries.delete(conversation.id);
    this.#entries.set(conversation.id, {
      conversation,
      expires: this.#now() + this.#ttlMs,
    });
  }

  remove(conversation: Conversation): void {
    this.#entries.delete(conversation.id);
  }

  #removeExpired(): void {
    const now = this.#now();
    for (const [id, { conversation, expires }] of this.#entries) {
      if (expires > now) {
        break; // In order of last use, so the rest are newer
      }
      if (!conversation.running) {
        this.#entries.delete(id);
      }
    }
  }

  // A running turn is never cut off. If all of them are running the store goes
  // over the cap for a moment, which the limit on requests keeps small.
  #makeRoom(): void {
    for (const [id, { conversation }] of this.#entries) {
      if (this.#entries.size < this.#maxConversations) {
        return;
      }
      if (!conversation.running) {
        this.#entries.delete(id);
      }
    }
  }
}

/**
 * @summary The daily cap on model turns. It counts across the whole site, because
 * limits per IP are easy to get around on a public site. Lives in memory per
 * backend process, so it resets at midnight and on restart.
 */
export class DailyTurnCounter {
  #max: number;
  #now: () => number;
  #day = "";
  #count = 0;

  /** @param max 0 means no limit */
  constructor(max: number, now: () => number = Date.now) {
    this.#max = max;
    this.#now = now;
  }

  /** @returns False if the day's turns are used up */
  tryConsume(): boolean {
    const day = new Date(this.#now()).toDateString();
    if (day !== this.#day) {
      this.#day = day;
      this.#count = 0;
    }
    if (this.#max > 0 && this.#count >= this.#max) {
      return false;
    }
    this.#count += 1;
    return true;
  }
}
