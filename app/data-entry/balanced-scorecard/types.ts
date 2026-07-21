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
  kpiDefinitionId: number | null;
  trackingFrequency: "monthly" | "annually";
  pendingCustomKpiRequestId?: string | null;
  pendingCustomKpiTitle?: string | null;
  pendingCustomKpiStatus?:
    | "PENDING_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "REPLACED";
  approvedKpiDefinitionId?: number | null;
};

export type ScorecardCustomKpiRequest = {
  id: string;
  title: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "REPLACED";
  replacementKpiDefinitionId: number | null;
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

export type ScorecardSavedBuild = {
  id: string;
  perspectiveLevel: 1 | 2 | 3 | 4;
  perspectiveDescription: string;
  objectiveCount: number;
  initiativeCount: number;
  kpiCount: number;
  objectiveNames: string[];
  updatedAt: string;
};

export type ScorecardSavedDraftPerspective = {
  perspectiveLevel: 1 | 2 | 3 | 4;
  perspectiveDescription: string;
  objectives: ScorecardDraftObjectiveInput[];
};

export type ScorecardDraftsResponse = {
  drafts: ScorecardSavedBuild[];
  hierarchies: ScorecardSavedDraftPerspective[];
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

export type CustomKpiReferenceOptions = {
  availableMeasureDefinitions: Array<{
    id: number;
    name: string;
    variableName: string | null;
    unit: string | null;
    category: string | null;
    subcategory: string | null;
  }>;
  availableUnits: Array<{
    id: number;
    name: string;
  }>;
  availableDataTypes: Array<{
    id: number;
    name: string;
  }>;
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
