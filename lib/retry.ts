export interface RetryPolicyOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Heuristic: is this error a transient database / infrastructure failure worth
 * retrying (connection blips, deadlocks, serialization failures, pool
 * exhaustion) rather than a real bug? Matches on the error text / Postgres
 * SQLSTATE fragments.
 */
export const isTransientDbError = (error: unknown): boolean => {
  const message = String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("tempor") ||
    message.includes("econn") ||
    message.includes("40p01") ||
    message.includes("deadlock") ||
    message.includes("40001") ||
    message.includes("serialization") ||
    message.includes("pool exhausted") ||
    message.includes("too many clients")
  );
};

export const executeWithRetry = async <T>(
  task: () => Promise<T>,
  options: RetryPolicyOptions = {},
  onRetry?: (retryCount: number, error: unknown) => Promise<void> | void,
): Promise<T> => {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;

  let retries = 0;

  while (true) {
    try {
      return await task();
    } catch (error) {
      if (!isTransientDbError(error) || retries >= maxRetries) {
        throw error;
      }

      retries += 1;
      if (onRetry) {
        await onRetry(retries, error);
      }

      const exponentialDelay = baseDelayMs * Math.pow(2, retries);
      const jitter = Math.floor(Math.random() * baseDelayMs);
      await delay(exponentialDelay + jitter);
    }
  }
};
