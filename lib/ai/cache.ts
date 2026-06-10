type CacheKey = string;
type CacheEntry<T> = { promise: Promise<T>; ts: number };

const requestCache = new Map<CacheKey, CacheEntry<unknown>>();

export const withCache = <T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 30000,
): Promise<T> => {
  const entry = requestCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) {
    return entry.promise as Promise<T>;
  }
  const promise = fn();
  requestCache.set(key, { promise, ts: Date.now() });
  return promise;
};

export const clearRequestCache = (): void => {
  requestCache.clear();
};
