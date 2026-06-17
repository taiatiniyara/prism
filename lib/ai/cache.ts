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

export const invalidateCache = (keyPattern: string): void => {
  if (keyPattern === "*") {
    requestCache.clear();
    return;
  }
  for (const key of requestCache.keys()) {
    if (key.includes(keyPattern)) {
      requestCache.delete(key);
    }
  }
};

export const invalidateCacheByPrefix = (prefix: string): void => {
  for (const key of requestCache.keys()) {
    if (key.startsWith(prefix)) {
      requestCache.delete(key);
    }
  }
};

const CACHE_PREFIXES = {
  benchmarking: "benchmarking",
  kpi: "kpi",
  diagnostics: "diagnostics",
  schema: "schema",
  report: "report",
  datasets: "datasets",
  trends: "trends",
  dataQuality: "data_quality",
  compliance: "compliance",
  performance: "performance",
} as const;

export const CACHE_INVALIDATION = CACHE_PREFIXES;
