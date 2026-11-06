import {
  grabBoolean,
  grabNonNegativeInt,
  grabPositiveInt,
} from "../../../../common/utils/dotEnvHelpers.js";

export interface ChatLimits {
  /** Model calls per turn */
  maxIterations: number;
  /** Time per turn, across all its steps */
  turnTimeoutMs: number;
  /** Tokens per turn. Cached input doesn't count, see Orchestrator. */
  turnMaxTokens: number;
  /** Leaf layers turned on per action */
  maxLayersOn: number;
  /** Turns per day across the site. 0 means no limit. */
  dailyMaxTurns: number;
  /** Live conversations in memory. 0 means no limit. */
  maxConversations: number;
  /** Idle time before a conversation is removed */
  conversationTtlMs: number;
}

export const isChatEnabled = (): boolean =>
  grabBoolean("AI_CHAT_ENABLED", false);

export const readWfsTimeoutMs = (): number =>
  grabPositiveInt("AI_WFS_TIMEOUT_MS", 10_000);

/** For development: index from the vector cache alone, see search.service.ts */
export const isIndexBuildSkipped = (): boolean =>
  grabBoolean("AI_DEBUG_SKIP_INDEX_BUILD", false);

export const readChatLimits = (): ChatLimits => ({
  maxIterations: grabPositiveInt("AI_MAX_ITERATIONS", 8),
  turnTimeoutMs: grabPositiveInt("AI_TURN_TIMEOUT_MS", 120_000),
  turnMaxTokens: grabPositiveInt("AI_TURN_MAX_TOKENS", 100_000),
  maxLayersOn: grabPositiveInt("AI_MAX_LAYERS_ON", 25),
  dailyMaxTurns: grabNonNegativeInt("AI_DAILY_MAX_TURNS", 2000),
  maxConversations: grabNonNegativeInt("AI_MAX_CONVERSATIONS", 1000),
  conversationTtlMs: grabPositiveInt("AI_CONVERSATION_TTL_MS", 3_600_000),
});
