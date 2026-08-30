/**
 * Shared contract for the new unified formula builder.
 * Both the React UI (components/formula-builder/*) and the server actions
 * (app/settings/kpi/unified-formula-service.ts) build against these types.
 */

export type BuilderMode = "kpi" | "measure";

/** Physical dimension id columns (match FormulaInput fields on db/schema/dataEntry.ts). */
export type DimensionField =
  | "provider_id"
  | "category_id"
  | "technology_id"
  | "asset_class_id"
  | "customer_type_id"
  | "payment_mode_id"
  | "consumption_band_id"
  | "division_id"
  | "gender_id"
  | "utility_function_id";

/**
 * The 10 canonical dimensions.
 * - `field`      physical id column on data_entries / FormulaInput
 * - `scopeKey`   the (legacy) name used in measure_dimension_scope.dimension
 * - `listName`   the managed_lists.name whose items are this dim's members
 * - `allMember`  canonical "All" member id (lib/data-entry/dimensions.ts ALL_MEMBER)
 */
export const DIMENSIONS: ReadonlyArray<{
  field: DimensionField;
  scopeKey: string;
  listName: string;
  allMember: number;
  label: string;
}> = [
  { field: "provider_id", scopeKey: "provider", listName: "Provider", allMember: 20, label: "Provider" },
  { field: "category_id", scopeKey: "type", listName: "Category", allMember: 30, label: "Category" },
  { field: "technology_id", scopeKey: "source", listName: "Technology", allMember: 40, label: "Technology" },
  { field: "asset_class_id", scopeKey: "resource_type", listName: "Asset Class", allMember: 983, label: "Asset Class" },
  { field: "customer_type_id", scopeKey: "customer_type", listName: "Customer Type", allMember: 690, label: "Customer Type" },
  { field: "payment_mode_id", scopeKey: "payment_mode", listName: "Payment Mode", allMember: 720, label: "Payment Mode" },
  { field: "consumption_band_id", scopeKey: "band", listName: "Consumption Band", allMember: 1005, label: "Consumption Band" },
  { field: "division_id", scopeKey: "division", listName: "Division", allMember: 1011, label: "Division" },
  { field: "gender_id", scopeKey: "gender", listName: "Gender", allMember: 1022, label: "Gender" },
  { field: "utility_function_id", scopeKey: "utility_function", listName: "Utility Function", allMember: 1023, label: "Utility Function" },
];

export const SCOPE_KEY_TO_FIELD: Record<string, DimensionField> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.scopeKey, d.field]),
);
export const ALL_MEMBER_BY_FIELD: Record<DimensionField, number> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.field, d.allMember]),
) as Record<DimensionField, number>;

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
  applicableDims: MeasureApplicableDim[];
}

export interface TargetOption {
  id: number;
  name: string;
  formula: string | null;
  hasFormula: boolean;
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
}

export interface SavePayload {
  mode: BuilderMode;
  ownerId: number;
  formula: string;
  cards: TagCardState[];
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface RecomputeResult {
  processed: number;
  failed: number;
  byPeriod: Array<{
    reportPeriodId: number;
    kpiDefId: number;
    status: string;
    value?: string;
    reason?: string;
  }>;
}
