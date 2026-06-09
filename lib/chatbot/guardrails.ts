// Server-side guardrails that run before any LLM call.
//
// These complement the prompt-level CHATBOT_REFUSAL_PATTERNS in
// lib/chatbot/prompt.ts. Prompt rules depend on the model honoring them;
// these rules are deterministic and run on every request.

export interface ChatbotGuardrailHit {
  rule: string;
  reason: string;
}

interface GuardrailRule {
  rule: string;
  reason: string;
  pattern: RegExp;
}

// Patterns are intentionally narrow to minimize false positives. Adjust by
// adding new rules rather than broadening existing ones.
const GUARDRAIL_RULES: GuardrailRule[] = [
  {
    rule: "REF-PII-EMAIL",
    reason:
      "I cannot return email addresses or other personal contact details. Ask the workspace administrator if you need to reach a specific user.",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i,
  },
  {
    rule: "REF-PII-PHONE",
    reason:
      "I cannot return personal phone numbers. Ask the workspace administrator if you need to reach a specific user.",
    pattern: /(?:\+?\d[\s-]?){7,}\d/,
  },
  {
    rule: "REF-PRIVATE-COMMENTS",
    reason:
      "Reviewer comments and private notes are restricted. I can summarize aggregate KPI status, but not the underlying private comments.",
    pattern:
      /\b(?:private|internal|reviewer|reviewers)\s+(?:comment|comments|notes?|feedback)\b/i,
  },
  {
    rule: "REF-CREDENTIALS",
    reason:
      "I cannot return credentials, API keys, tokens, or password material.",
    pattern:
      /\b(?:password|api[\s_-]?key|secret[\s_-]?key|access[\s_-]?token|bearer[\s_-]?token)\b/i,
  },
  {
    rule: "REF-BULK-EXPORT",
    reason:
      "Bulk export of all users, all utilities, or full datasets is not available through chat. Use the relevant settings or data-entry export tools.",
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

export const evaluateChatbotInputGuardrails = (
  message: string,
): ChatbotGuardrailHit | null => {
  if (!message) {
    return null;
  }

  for (const rule of GUARDRAIL_RULES) {
    if (rule.pattern.test(message)) {
      return { rule: rule.rule, reason: rule.reason };
    }
  }

  return null;
};

const PII_PATTERNS = [
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, type: "email" },
  { pattern: /(?:\+?\d[\s-]?){7,}\d/g, type: "phone" },
  {
    pattern: /\b(?:SSN|Social Security)[:\s]*\d{3}-?\d{2}-?\d{4}\b/gi,
    type: "ssn",
  },
];

export const filterChatbotOutput = (
  text: string,
): { filtered: string; redacted: boolean } => {
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
