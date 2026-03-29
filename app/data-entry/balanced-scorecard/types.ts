export type ScorecardFilterContext = {
  reportPeriodId: number;
  reportTypeId: number | null;
  serviceAreaId: number | null;
  kpiCategoryId: number | null;
  kpiSubcategoryId: number | null;
};

export type ExclusionReasonCode =
  | "MISSING_TARGET"
  | "MISSING_ACTUAL"
  | "INVALID_RANGE"
  | "NOT_APPROVED"
  | "DUPLICATE_SUPERSEDED";

export type ExcludedScoreRow = {
  kpiId: string;
  reasonCode: ExclusionReasonCode;
  reasonMessage: string;
};

export type ScoreStatusBreakdown = {
  onTrack: number;
  atRisk: number;
  offTrack: number;
};

export type PerspectiveScore = {
  perspectiveLevel: number;
  perspectiveLabel: string;
  weightedScore: number | null;
  includedCount: number;
  excludedCount: number;
  statusBreakdown: ScoreStatusBreakdown;
  exclusions: ExcludedScoreRow[];
};

export type ScorecardSnapshot = {
  generatedAt: string;
  overallScore: number | null;
  perspectiveScores: PerspectiveScore[];
  excludedSummary: {
    totalExcluded: number;
    byReason: Record<string, number>;
  };
};

export type ScorecardResponse = {
  context: ScorecardFilterContext;
  snapshot: ScorecardSnapshot;
};

export type ScorecardTargetInput = {
  year: number;
  month: number | null;
  targetValue: string;
};

export type ScorecardUpdatePayload = {
  kpiId: string | null;
  kpiDefinitionId: number;
  perspectiveLevel: 1 | 2 | 3 | 4;
  objective: string;
  target: ScorecardTargetInput;
};

export type ScorecardKpiOption = {
  kpiId: string | null;
  kpiDefinitionId: number;
  reportPeriodId: number;
  kpiName: string;
};

export type ScorecardInputRow = {
  kpiId: string;
  kpiDefinitionId: number;
  perspectiveLevel: number;
  perspectiveLabel: string;
  perspectiveWeight: number;
  kpiWeight: number;
  actualValue: number | null;
  targetValue: number | null;
  status: string | null;
  approvalStateId: number | null;
  updatedAt: Date;
  filterScopeKey: string;
};
