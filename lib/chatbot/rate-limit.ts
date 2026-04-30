// In-memory sliding-window rate limiter for the chatbot endpoint.
//
// Limitation: state is per Node.js process. For multi-instance deployments,
// replace `requestLog` with a shared store (Redis, Postgres, Upstash) keyed
// by user id. The public API of `consumeChatbotRateLimit` is intentionally
// minimal so the storage backend can be swapped without touching callers.

const requestLog = new Map<string, number[]>();

export interface ChatbotRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
}

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const consumeChatbotRateLimit = (
  userId: string | number,
  now: number = Date.now(),
): ChatbotRateLimitResult => {
  const limit = positiveInt(process.env.CHATBOT_RATE_LIMIT_REQUESTS, 30);
  const windowMs =
    positiveInt(process.env.CHATBOT_RATE_LIMIT_WINDOW_SECONDS, 60) * 1000;

  const key = String(userId);
  const cutoff = now - windowMs;
  const previous = requestLog.get(key) ?? [];
  const recent = previous.filter((timestamp) => timestamp > cutoff);

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    requestLog.set(key, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      limit,
      remaining: 0,
    };
  }

  recent.push(now);
  requestLog.set(key, recent);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit,
    remaining: Math.max(0, limit - recent.length),
  };
};

// Exposed for tests only.
export const __resetChatbotRateLimitForTests = (): void => {
  requestLog.clear();
};
