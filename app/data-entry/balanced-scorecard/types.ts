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
  rows?: ScorecardInputRow[];
  relationships?: ScorecardRelationship[];
};

export type ScorecardNodeLevel =
  | "perspective"
  | "objective"
  | "initiative"
  | "kpi";

export type ScorecardNodeRef = {
  level: ScorecardNodeLevel;
  perspectiveLevel: 1 | 2 | 3 | 4;
  objectiveDescription?: string;
  keyInitiativeDescription?: string;
  kpiId?: number;
};

export type ScorecardRelationship = {
  id: string;
  source: ScorecardNodeRef;
  target: ScorecardNodeRef;
  relationshipType: "influences" | "depends_on" | "contributes_to" | "blocks";
  weight?: number;
  note?: string;
};

export type ScorecardTargetInput = {
  year?: number;
  month?: number | null;
  targetValue: string;
};

export type ScorecardUpdatePayload = {
  reportPeriodId?: number;
  kpiId: string | null;
  kpiDefinitionId: number;
  perspectiveLevel: 1 | 2 | 3 | 4;
  perspectiveDescription: string;
  strategicObjective: string;
  keyInitiative: string;
  trackingFrequency: "monthly" | "annually";
  target: ScorecardTargetInput;
  relationships?: ScorecardRelationship[];
};

export type ScorecardRelationshipsUpdatePayload = {
  reportPeriodId: number;
  relationships: ScorecardRelationship[];
};

export type ScorecardDraftKpiInput = {
  kpiDefinitionId: number;
  trackingFrequency: "monthly" | "annually";
};

export type ScorecardDraftInitiativeInput = {
  description: string;
  kpis: ScorecardDraftKpiInput[];
};

export type ScorecardDraftObjectiveInput = {
  description: string;
  keyInitiatives: ScorecardDraftInitiativeInput[];
};

export type ScorecardDraftSavePayload = {
  reportPeriodId: number;
  perspectiveLevel: 1 | 2 | 3 | 4;
  perspectiveDescription: string;
  objectives: ScorecardDraftObjectiveInput[];
};

export type ScorecardKpiOption = {
  kpiId: string | null;
  kpiDefinitionId: number;
  reportPeriodId: number;
  kpiName: string;
  categoryId: number | null;
  subcategoryId: number | null;
  targetValue: string | null;
};

export type ScorecardInputRow = {
  kpiId: string;
  kpiDefinitionId: number;
  kpiName?: string | null;
  objective?: string | null;
  keyInitiative?: string | null;
  trackingFrequency?: "monthly" | "annually" | null;
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
