/**
 * Shared contract for the new unified formula builder.
 * Both the React UI (components/formula-builder/*) and the server actions
 * (app/settings/kpi/unified-formula-service.ts) build against these types.
 */

export type BuilderMode = "kpi" | "measure";

/**
 * The 10 canonical dimensions now live in the shared, single-source-of-truth
 * map at `lib/dimensions/dimension-map.ts` (which also carries code aliases +
 * query synonyms). Re-exported here so existing formula-builder imports keep
 * working unchanged — do NOT redefine the mapping in this file.
 */
import type { DimensionField } from "@/lib/dimensions/dimension-map";
export {
  DIMENSIONS,
  SCOPE_KEY_TO_FIELD,
  ALL_MEMBER_BY_FIELD,
} from "@/lib/dimensions/dimension-map";
export type { DimensionField };

export type DimMode = "pin" | "all" | "inherit";
export type GrainMode = "inherit" | "rollup" | "pin";

/**
 * Distinct per-variable colour classes (bg + text, light & dark). Assigned by
 * variable order and used to tint BOTH a variable's formula token and its
 * input card, so a token and its card are visually linked.
 */
export const VARIABLE_COLORS: string[] = [
  "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200",
  "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950/50 dark:text-fuchsia-200",
  "bg-yellow-200 text-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-200",
  "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200",
];

export const colorForVariableIndex = (index: number): string =>
  VARIABLE_COLORS[((index % VARIABLE_COLORS.length) + VARIABLE_COLORS.length) %
    VARIABLE_COLORS.length];

export interface DimBinding {
  mode: DimMode;
  /** the pinned member id when mode==="pin"; else null */
  memberId: number | null;
}

/** One formula variable → one measure + its per-dimension slice. */
export interface TagCardState {
  /** stable client id */
  key: string;
  variableName: string;
  measureDefId: number | null;
  measureName?: string;
  unitLabel?: string;
  strataId?: number | null;
  grainMode: GrainMode;
  /** when true, a missing value for this input is treated as 0 instead of
   *  failing the formula. Default (absent/false) = mandatory. */
  isOptional?: boolean;
  /** only fields applicable to the measure are populated */
  dims: Partial<Record<DimensionField, DimBinding>>;
}

export interface MemberOption {
  id: number;
  name: string;
}

/** Which dims apply to a measure + (for by_context) which members are valid. */
export interface MeasureApplicableDim {
  field: DimensionField;
  expansionMode: "all_members" | "by_context";
  /** restrict Pin choices when by_context (empty/undefined = all members valid) */
  allowedMemberIds?: number[];
}

export interface MeasureCatalogueItem {
  id: number;
  name: string;
  variableName: string | null;
  unitLabel: string | null;
  strataId: number | null;
  groupName: string | null;
  subgroupName: string | null;
  /** Data-type name (e.g. "numeric", "option", "text", "boolean"). Categorical
   *  types mean this measure is descriptive — not numerically computable. */
  dataTypeName: string | null;
  /** measure_definitions.is_calculated — this measure is itself computed by a
   *  formula (e.g. Total Costs). A KPI that just mirrors a computed measure is
   *  published when that measure is computed, so it needs no compute of its own. */
  isCalculated: boolean;
  applicableDims: MeasureApplicableDim[];
}

export interface TargetOption {
  id: number;
  name: string;
  formula: string | null;
  hasFormula: boolean;
  /** A working formula: present, every variable bound, and every bound input
   *  resolves to a CURRENT active measure. False for empty formulas AND for
   *  broken ones (dangling legacy bindings needing repair/repointing). */
  isProperlyConfigured: boolean;
  /** kpi_definitions.is_descriptive — intent flag: this KPI publishes an entered
   *  value by reference and is never numerically computed. Always false for
   *  calculated-measure targets. */
  isDescriptive: boolean;
  /** MEASURE targets only: an active companion KPI (same name) already exists —
   *  i.e. this calculated measure is currently published as a KPI. Always false
   *  for KPI targets. */
  isTrackedAsKpi: boolean;
  /** display format (kpi/measure unit + is_currency) — for the harness's
   *  format-adjusted result preview. */
  unitLabel?: string | null;
  unitId?: number | null;
  isCurrency?: boolean;
  /** rehydrated tag cards from formula_binding (fallback to legacy JSON) */
  existingCards: TagCardState[];
}

export interface BuilderData {
  /** initial mode (radio default); the builder can switch at runtime */
  mode: BuilderMode;
  /** all KPI definitions */
  kpiTargets: TargetOption[];
  /** calculated measures (is_calculated = true) */
  measureTargets: TargetOption[];
  measures: MeasureCatalogueItem[];
  /** member option lists keyed by physical dimension field */
  dimMembers: Record<DimensionField, MemberOption[]>;
  /** UoM options (the "Unit" managed list) for the inline unit editor */
  units: MemberOption[];
}

export interface SavePayload {
  mode: BuilderMode;
  ownerId: number;
  formula: string;
  cards: TagCardState[];
  /** MEASURE mode only: also publish this calculated measure as a KPI (a
   *  companion kpi_definition that references the measure by a single-variable
   *  pass-through — "compute once, reference many"). */
  trackAsKpi?: boolean;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface RecomputeResult {
  processed: number;
  failed: number;
  /**
   * Periods where the KPI/measure does not apply (no inputs reported) — surfaced
   * separately so they don't inflate the failure count. Optional for back-compat
   * with callers/paths that don't distinguish it (treated as 0).
   */
  notApplicable?: number;
  byPeriod: Array<{
    reportPeriodId: number;
    kpiDefId: number;
    status: string;
    value?: string;
    reason?: string;
  }>;
}
