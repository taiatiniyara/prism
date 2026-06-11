type CacheKey = string;
type CacheEntry<T> = { promise: Promise<T>; ts: number };

const requestCache = new Map<CacheKey, CacheEntry<unknown>>();
const MAX_CACHE_SIZE = 1000;

const pruneExpired = (): void => {
  const now = Date.now();
  for (const [key, entry] of requestCache) {
    if (now - entry.ts > 60000) {
      requestCache.delete(key);
    }
  }
};

export const withCache = <T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 30000,
): Promise<T> => {
  const entry = requestCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) {
    return entry.promise as Promise<T>;
  }

  if (requestCache.size > MAX_CACHE_SIZE) {
    pruneExpired();
  }

  const promise = fn().catch((err) => {
    requestCache.delete(key);
    throw err;
  });
  requestCache.set(key, { promise, ts: Date.now() });
  return promise;
};

export const clearRequestCache = (): void => {
  requestCache.clear();
};
