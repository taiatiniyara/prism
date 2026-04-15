const POLICY_BYPASS_PATTERNS = [
  /ignore\s+all\s+rules/i,
  /bypass\s+(policy|guardrails|authorization)/i,
  /disable\s+(security|authorization|role)/i,
  /write\s+to\s+database/i,
  /update\s+records?/i,
  /delete\s+records?/i,
];

export const DEFAULT_AI_TIMEOUT_MS = Number(
  process.env.AI_TIMEOUT_MS ?? "20000",
);
export const DEFAULT_AI_MAX_ROWS = Number(process.env.AI_MAX_ROWS ?? "200");

export class AiGuardrailError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "POLICY_BYPASS"
      | "TIMEOUT"
      | "VALIDATION"
      | "FORBIDDEN",
  ) {
    super(message);
    this.name = "AiGuardrailError";
  }
}

export const detectPolicyBypass = (prompt: string): boolean => {
  return POLICY_BYPASS_PATTERNS.some((pattern) => pattern.test(prompt));
};

export const enforceReadOnlyPrompt = (prompt: string): void => {
  if (detectPolicyBypass(prompt)) {
    throw new AiGuardrailError(
      "Prompt violates AI safety policy.",
      "POLICY_BYPASS",
    );
  }
};

export const enforceMaxRows = <T>(
  rows: T[],
  maxRows = DEFAULT_AI_MAX_ROWS,
): T[] => {
  return rows.slice(0, maxRows);
};

export const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
): Promise<T> => {
  return await Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new AiGuardrailError("AI query timed out.", "TIMEOUT"));
      }, timeoutMs);
    }),
  ]);
};
