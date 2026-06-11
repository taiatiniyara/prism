import type { AiGuardrailResult, AiToolName } from "./types";
import type { CurrentUser } from "@/lib/user.service";

interface GuardrailRule {
  rule: string;
  reason: string;
  pattern: RegExp;
}

const ADMIN_ROLES = new Set(["BMO", "DEV"]);

const INPUT_GUARDRAIL_RULES: GuardrailRule[] = [
  {
    rule: "REF-PII-EMAIL",
    reason:
      "I cannot process requests containing email addresses or personal contact details.",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i,
  },
  {
    rule: "REF-PII-PHONE",
    reason:
      "I cannot process requests containing phone numbers or personal contact details.",
    pattern: /(?:\+?\d[\s-]?){7,}\d/,
  },
  {
    rule: "REF-PRIVATE-COMMENTS",
    reason:
      "Reviewer comments and private notes are restricted. I can summarize aggregate KPI status, but not private comments.",
    pattern:
      /\b(?:private|internal|reviewer|reviewers)\s+(?:comment|comments|notes?|feedback)\b/i,
  },
  {
    rule: "REF-CREDENTIALS",
    reason: "I cannot process requests containing credentials or secrets.",
    pattern:
      /\b(?:password|api[\s_-]?key|secret[\s_-]?key|access[\s_-]?token|bearer[\s_-]?token)\b/i,
  },
  {
    rule: "REF-BULK-EXPORT",
    reason:
      "Bulk export of all data is not available through chat. Use the relevant settings or data-entry export tools.",
    pattern:
      /\b(?:export|download|dump|extract)\b[^.\n]{0,40}\b(?:all\s+(?:users|utilities|kpis|records|data|rows)|entire\s+(?:database|dataset|table))\b/i,
  },
  {
    rule: "REF-PROMPT-INJECTION",
    reason: "I cannot process requests that attempt to modify my instructions.",
    pattern:
      /\b(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions?|rules?|prompts?)|disregard\s+(?:all\s+)?(?:previous|prior)|forget\s+(?:all\s+)?(?:previous|prior))\b/i,
  },
];

export const validateInput = (message: string): AiGuardrailResult => {
  if (!message || message.trim().length === 0) {
    return {
      passed: false,
      rule: "REF-EMPTY",
      reason: "Message cannot be empty.",
    };
  }

  if (message.length > 4000) {
    return {
      passed: false,
      rule: "REF-LENGTH",
      reason: "Message is too long. Maximum length is 4000 characters.",
    };
  }

  for (const rule of INPUT_GUARDRAIL_RULES) {
    if (rule.pattern.test(message)) {
      return {
        passed: false,
        rule: rule.rule,
        reason: rule.reason,
      };
    }
  }

  return { passed: true };
};

const ADMIN_ONLY_TOOLS: AiToolName[] = ["get_governance_audit", "get_configuration_options"];

export const validateToolAccess = (
  toolName: AiToolName,
  user: CurrentUser,
): AiGuardrailResult => {
  if (ADMIN_ONLY_TOOLS.includes(toolName)) {
    const isAdmin = user.role != null && ADMIN_ROLES.has(user.role.toUpperCase());
    if (!isAdmin) {
      return {
        passed: false,
        rule: "TOOL-ADMIN-ONLY",
        reason: `The tool '${toolName}' requires administrator access.`,
      };
    }
  }

  return { passed: true };
};

const PII_PATTERNS = [
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, type: "email" },
  {
    pattern: /(?:\+?\d[\s-]?){8,}\d/g,
    type: "phone",
  },
  {
    pattern: /\b(?:SSN|Social Security)[:\s]*\d{3}-?\d{2}-?\d{4}\b/gi,
    type: "ssn",
  },
];

export const filterOutput = (text: string): { filtered: string; redacted: boolean } => {
  let filtered = text;
  let redacted = false;

  for (const { pattern, type } of PII_PATTERNS) {
    const matches = filtered.match(pattern);
    if (matches && matches.length > 0) {
      filtered = filtered.replace(pattern, `[REDACTED ${type.toUpperCase()}]`);
      redacted = true;
    }
  }

  return { filtered, redacted };
};
