import { AiGuardrailError } from "./guardrails";

export type AiErrorCode =
  | "VALIDATION"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "DOWNSTREAM_FAILURE"
  | "NO_DATA"
  | "POLICY_BYPASS";

export interface SafeAiError {
  message: string;
  code: AiErrorCode;
}

export const mapToSafeAiError = (error: unknown): SafeAiError => {
  if (error instanceof AiGuardrailError) {
    if (error.code === "TIMEOUT") {
      return {
        code: "TIMEOUT",
        message: "The request timed out. Please retry.",
      };
    }

    if (error.code === "POLICY_BYPASS") {
      return {
        code: "POLICY_BYPASS",
        message: "This request cannot be completed due to policy restrictions.",
      };
    }

    if (error.code === "FORBIDDEN") {
      return {
        code: "FORBIDDEN",
        message: "You are not allowed to access this data.",
      };
    }

    return { code: "VALIDATION", message: "The request is invalid." };
  }

  if (error instanceof Error) {
    return {
      code: "DOWNSTREAM_FAILURE",
      message: error.message || "A downstream dependency failed.",
    };
  }

  return {
    code: "DOWNSTREAM_FAILURE",
    message: "An unexpected error occurred while processing the AI request.",
  };
};
