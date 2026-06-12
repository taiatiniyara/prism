import type {
  BscActivityKind,
  BscProjectStatus,
  BscTemplateLevel,
  BscThemeStyles,
} from "@/db/schema/bsc-builder";
import type { KpiTrajectory } from "@/db/schema/kpi";

export type {
  BscActivityKind,
  BscProjectStatus,
  BscTemplateLevel,
  BscThemeStyles,
  KpiTrajectory,
};

export type ThemeResponse = {
  styles: BscThemeStyles;
  canEdit: boolean;
};

// ---------------------------------------------------------------------------
// Master template (shared)
// ---------------------------------------------------------------------------

export type TemplateNode = {
  id: string;
  parentId: string | null;
  level: BscTemplateLevel;
  label: string;
  isMandatory: boolean;
  ord: number;
  children: TemplateNode[];
};

export type TemplateTreeResponse = {
  nodes: TemplateNode[];
};

// KPI picker option (active + visible to the utility).
export type KpiOption = {
  kpiDefinitionId: number;
  name: string;
  unit: string | null;
};

// Tracking-frequency option, sourced from the "Report Type" managed list.
export type ReportTypeOption = {
  id: number;
  name: string;
};

// ---------------------------------------------------------------------------
// Per-utility scorecard (assembled overlay)
// ---------------------------------------------------------------------------

export type ScorecardKpiLink = {
  id: string;
  kpiDefinitionId: number | null;
  kpiName: string | null;
  unit: string | null;
  pendingCustomKpiRequestId: string | null;
  trajectory: KpiTrajectory | null;
  ord: number;
};

export type ScorecardInitiative = {
  id: string;
  title: string;
  description: string | null;
  kind: BscActivityKind;
  startDate: string | null;
  targetCompletionDate: string | null;
  status: BscProjectStatus | null;
  ord: number;
  kpis: ScorecardKpiLink[];
};

export type ScorecardSpecificObjective = {
  id: string;
  description: string;
  ord: number;
  initiatives: ScorecardInitiative[];
};

export type ScorecardNode = {
  id: string;
  templateNodeId: string | null;
  level: BscTemplateLevel;
  label: string;
  isMandatory: boolean;
  isCustom: boolean;
  ord: number;
  children: ScorecardNode[];
  // Only populated on strategic_lever nodes.
  specificObjectives: ScorecardSpecificObjective[];
};

export type ScorecardResponse = {
  perspectives: ScorecardNode[];
};

// ---------------------------------------------------------------------------
// Save payloads (per-perspective overlay replace + trajectory)
// ---------------------------------------------------------------------------

export type KpiLinkInput = {
  kpiDefinitionId: number | null;
  pendingCustomKpiRequestId: string | null;
  ord: number;
};

export type InitiativeInput = {
  title: string;
  description: string | null;
  kind: BscActivityKind;
  startDate: string | null;
  targetCompletionDate: string | null;
  status: BscProjectStatus | null;
  ord: number;
  kpis: KpiLinkInput[];
};

export type SpecificObjectiveInput = {
  description: string;
  ord: number;
  initiatives: InitiativeInput[];
};

export type OverlayNodeInput = {
  templateNodeId: string | null;
  label: string | null;
  level: BscTemplateLevel;
  ord: number;
  children: OverlayNodeInput[];
  specificObjectives: SpecificObjectiveInput[];
};

export type SavePerspectiveOverlayPayload = {
  perspectiveTemplateNodeId: string;
  node: OverlayNodeInput;
};

export type SetTrajectoryPayload = {
  kpiDefinitionId: number;
  trajectory: KpiTrajectory | null;
};

// Inline KPI targets (year + optional month), shared per-utility per-KPI.
export type KpiTargetRow = {
  year: number;
  month: number | null;
  targetValue: string;
};

export type TargetPlanPeriod = {
  label: string;
  year: number;
  month: number | null;
  value: string;
};

export type TargetPlanInput = {
  frequency: string;
  startDate: string;
  periods: TargetPlanPeriod[];
};

export type SaveKpiTargetsPayload = {
  kpiDefinitionId: number;
  targets: KpiTargetRow[];
  // Full generated plan (incl. blank periods) so status can be computed.
  plan: TargetPlanInput | null;
};

// Per-KPI target-completion summary used by Preview status pills.
export type TargetPlanSummary = {
  kpiDefinitionId: number;
  total: number;
  filled: number;
  // Ordered period values (numeric or null when blank/non-numeric).
  values: (number | null)[];
};

// ---------------------------------------------------------------------------
// Template admin payloads
// ---------------------------------------------------------------------------

export type CreateTemplateNodePayload = {
  parentId: string | null;
  level: BscTemplateLevel;
  label: string;
  isMandatory: boolean;
  ord: number;
};

export type UpdateTemplateNodePayload = {
  label?: string;
  isMandatory?: boolean;
  ord?: number;
  isActive?: boolean;
};
