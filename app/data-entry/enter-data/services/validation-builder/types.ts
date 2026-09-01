export type ValidationCode =
  | "REQUIRED"
  | "INVALID_TYPE"
  | "NOT_RELEVANT"
  | "RANGE_OR_POLARITY";

export type ValidationRuleName =
  | "required-value"
  | "data-type"
  | "relevance"
  | "range-polarity";

export type ValidationRuleToggleMap = Record<ValidationRuleName, boolean>;

export interface DlDefValidationExclusion {
  inputDefId: number;
  codes: ValidationCode[];
}

export interface DevValidationBuilderConfig {
  enabled: boolean;
  ruleToggles: ValidationRuleToggleMap;
  customMessages: Partial<Record<ValidationCode, string>>;
  dlDefExclusions: DlDefValidationExclusion[];
}
