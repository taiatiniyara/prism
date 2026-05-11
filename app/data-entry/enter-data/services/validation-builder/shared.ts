import {
  DevValidationBuilderConfig,
  ValidationCode,
  ValidationRuleName,
  ValidationRuleToggleMap,
} from "@/app/data-entry/enter-data/services/validation-builder/types";

const VALIDATION_RULE_NAMES: ValidationRuleName[] = [
  "required-value",
  "data-type",
  "relevance",
  "range-polarity",
];

const VALIDATION_CODES: ValidationCode[] = [
  "REQUIRED",
  "INVALID_TYPE",
  "NOT_RELEVANT",
  "RANGE_OR_POLARITY",
];

export const defaultValidationRuleToggles: ValidationRuleToggleMap = {
  "required-value": true,
  "data-type": true,
  relevance: true,
  "range-polarity": true,
};

export const defaultDevValidationBuilderConfig: DevValidationBuilderConfig = {
  enabled: true,
  ruleToggles: defaultValidationRuleToggles,
  customMessages: {},
  dlDefExclusions: [],
};

function normalizeRuleToggles(
  input: Partial<Record<ValidationRuleName, boolean>> | undefined,
): ValidationRuleToggleMap {
  return {
    "required-value": input?.["required-value"] ?? true,
    "data-type": input?.["data-type"] ?? true,
    relevance: input?.relevance ?? true,
    "range-polarity": input?.["range-polarity"] ?? true,
  };
}

function normalizeCodes(codes: ValidationCode[] | undefined): ValidationCode[] {
  return (codes ?? []).filter((code): code is ValidationCode =>
    VALIDATION_CODES.includes(code),
  );
}

export function sanitizeDevValidationBuilderConfig(
  input: Partial<DevValidationBuilderConfig> | null | undefined,
): DevValidationBuilderConfig {
  if (!input) {
    return defaultDevValidationBuilderConfig;
  }

  const customMessages: Partial<Record<ValidationCode, string>> = {};
  for (const code of VALIDATION_CODES) {
    const message = input.customMessages?.[code];
    if (typeof message === "string" && message.trim().length > 0) {
      customMessages[code] = message.trim();
    }
  }

  const ruleToggles = normalizeRuleToggles(input.ruleToggles);
  for (const ruleName of VALIDATION_RULE_NAMES) {
    ruleToggles[ruleName] = ruleToggles[ruleName] ?? true;
  }

  const dlDefExclusions = (input.dlDefExclusions ?? [])
    .filter((item) => Number.isFinite(item?.inputDefId))
    .map((item) => ({
      inputDefId: Number(item.inputDefId),
      codes: normalizeCodes(item.codes),
    }))
    .filter((item) => item.codes.length > 0);

  return {
    enabled: input.enabled !== false,
    ruleToggles,
    customMessages,
    dlDefExclusions,
  };
}
