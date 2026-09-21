import type { AiChatMessage } from "./types";

export type SdkMessage = { role: "user" | "assistant"; content: string };

const APPROX_CHARS_PER_TOKEN = 3;
export const MAX_HISTORY_INPUT_TOKENS = 18000;

export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);

// Only "user"/"assistant" ever belong in the conversation array — the system
// prompt is injected separately, so a "system" role here would be rejected by the
// SDK, and any other value fails the ModelMessage[] schema outright. Client input is
// untyped at runtime, so enforce this rather than trusting the AiChatMessage["role"] type.
const VALID_MESSAGE_ROLES = new Set(["user", "assistant"]);

// Trims history to the last `maxHistoryTurns` turns and a token budget. The budget is
// spent NEWEST-first: the latest user question is always kept and the oldest messages
// are what fall off. (It previously walked oldest-first and `break`-ed once over budget,
// which dropped the newest messages — including the question being asked.)
export const prepareMessages = (
  messages: AiChatMessage[],
  maxHistoryTurns: number,
  onInvalidRole?: (role: string) => void,
): SdkMessage[] => {
  const maxMessages = maxHistoryTurns * 2;
  const recentMessages = messages.slice(-maxMessages);

  let totalTokens = 0;
  const kept: SdkMessage[] = [];
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (!VALID_MESSAGE_ROLES.has(msg.role)) {
      onInvalidRole?.(msg.role);
      continue;
    }
    const content = typeof msg.content === "string" ? msg.content : "";
    const cleaned = content.trim();
    if (!cleaned) continue;
    totalTokens += estimateTokens(cleaned);
    if (kept.length > 0 && totalTokens > MAX_HISTORY_INPUT_TOKENS) break;
    kept.push({ role: msg.role as "user" | "assistant", content: cleaned });
  }
  return kept.reverse();
};
