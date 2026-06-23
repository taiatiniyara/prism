import { logger } from "@/lib/logger";
import { recordToolFailure } from "../data-service/utils";

export const TOOL_TIMEOUT_MS = 15000;
export const PBI_TOOL_TIMEOUT_MS = 30000;
export const MAX_TOOL_RESULT_CHARS = 8000;

export const truncateResult = (result: unknown): unknown => {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= MAX_TOOL_RESULT_CHARS) return result;
  const truncated = str.slice(0, MAX_TOOL_RESULT_CHARS) + `\n\n[Truncated at ${MAX_TOOL_RESULT_CHARS} chars. Original length: ${str.length}]`;
  if (typeof result === "string") return truncated;
  return { _truncated: true, preview: str.slice(0, MAX_TOOL_RESULT_CHARS), original_length: str.length };
};

export const withTimeout = <T>(promise: Promise<T>, toolName: string, timeoutMs = TOOL_TIMEOUT_MS): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      const msg = `TOOL_TIMEOUT:${toolName} exceeded ${timeoutMs}ms`;
      logger.warn("[ai-tools] Tool timeout", { toolName, timeoutMs });
      reject(new Error(msg));
    }, timeoutMs),
  );
  return Promise.race([promise, timeout]).catch((err: unknown) => {
    recordToolFailure(toolName);
    throw err;
  });
};

export const withSizeLimit = <T>(promise: Promise<T>): Promise<T> =>
  promise.then((result) => truncateResult(result) as T);
