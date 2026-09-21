import type { ModelMessage } from "ai";

// Anthropic prompt-caching markers. Dependency-free so the placement logic is
// unit-testable. Render order is tools -> system -> messages and the cache is a PREFIX
// match, so the service places three breakpoints (of the 4 allowed per request):
//   1. last tool definition      (withCachedLastTool)  — shared by every user
//   2. static base system prompt (service.ts)          — shared by every user
//   3. tail of the conversation  (withMovingCacheBreakpoint) — per turn, moves each step
export const ANTHROPIC_CACHE_CONTROL = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};

export const withCachedLastTool = <T extends Record<string, unknown>>(tools: T): T => {
  const keys = Object.keys(tools);
  const lastKey = keys[keys.length - 1];
  if (!lastKey) return tools;
  return {
    ...tools,
    [lastKey]: { ...(tools[lastKey] as object), providerOptions: ANTHROPIC_CACHE_CONTROL },
  } as T;
};

type ProviderOptions = NonNullable<ModelMessage["providerOptions"]>;

const hasCacheMarker = (message: ModelMessage): boolean =>
  message.providerOptions?.anthropic?.cacheControl != null;

const withoutCacheMarker = (message: ModelMessage): ModelMessage => {
  const { anthropic, ...otherProviders } = message.providerOptions as ProviderOptions;
  const { cacheControl: _removed, ...otherAnthropic } = anthropic;
  void _removed;
  const providerOptions: ProviderOptions = {
    ...otherProviders,
    ...(Object.keys(otherAnthropic).length > 0 ? { anthropic: otherAnthropic } : {}),
  };
  const { providerOptions: _old, ...rest } = message;
  void _old;
  return (
    Object.keys(providerOptions).length > 0 ? { ...rest, providerOptions } : rest
  ) as ModelMessage;
};

// Marks the LAST message as a cache breakpoint and clears the marker from every earlier
// message. Used from prepareStep: in a tool loop each step re-sends the whole
// conversation so far (history + every earlier tool call/result), and without a
// breakpoint in `messages` all of that is billed — and prefilled — at the full input
// rate on every step. With it, step N reads steps 1..N-1 from cache (~0.1x) and writes
// only what the previous step appended.
//
// Exactly one marker survives because prepareStep message overrides carry forward to
// later steps; leaving old markers in place would exceed Anthropic's 4-breakpoint limit
// after two steps. Removing a marker does not invalidate what it cached — markers are
// not part of the cached prefix.
export const withMovingCacheBreakpoint = (messages: ModelMessage[]): ModelMessage[] => {
  if (messages.length === 0) return messages;
  const lastIndex = messages.length - 1;
  return messages.map((message, index) => {
    if (index === lastIndex) {
      return {
        ...message,
        providerOptions: {
          ...message.providerOptions,
          anthropic: {
            ...message.providerOptions?.anthropic,
            ...ANTHROPIC_CACHE_CONTROL.anthropic,
          },
        },
      } as ModelMessage;
    }
    return hasCacheMarker(message) ? withoutCacheMarker(message) : message;
  });
};
