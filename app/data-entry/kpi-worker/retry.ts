export interface RetryPolicyOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isTransientKpiError = (error: unknown): boolean => {
  const message = String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("tempor") ||
    message.includes("econn")
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
      if (!isTransientKpiError(error) || retries >= maxRetries) {
        throw error;
      }

      retries += 1;
      if (onRetry) {
        await onRetry(retries, error);
      }

      await delay(baseDelayMs * retries);
    }
  }
};
