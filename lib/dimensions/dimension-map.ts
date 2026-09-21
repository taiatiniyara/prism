/**
 * THE single source of truth for PRISM's 10 canonical analytical dimensions.
 *
 * Historically this mapping was hand-rolled in a dozen places (the formula
 * builder, the enter-data services, the aggregated/KPI workers, the AI
 * completeness breakdown, migration scripts) with THREE different vocabularies
 * for the same dimension — canonical scope key, physical column, and a camelCase
 * code alias — that did not line up 1:1. Getting the mapping wrong silently
 * queries the WRONG column. This module fixes that: every consumer resolves a
 * dimension through here, so there is exactly one place the four facets meet.
 *
 * Each dimension carries five facets plus query synonyms:
 * - `field`        physical id column on `data_entries` / `FormulaInput`
 * - `scopeKey`     canonical name in `measure_dimension_scope.dimension` /
 *                  `formula_binding_dimension.dimension` (also `MEASURE_DIMENSIONS`)
 * - `listName`     the `managed_lists.name` whose items populate this column
 * - `allMember`    canonical "All" member id (mirrors lib/data-entry/dimensions.ts)
 * - `label`        human display label
 * - `codeAlias`    the camelCase property name used in resolver/worker objects
 *                  (e.g. `dims.energySource` → `technology_id`)
 * - `synonyms`     extra natural-language terms that resolve to this dimension,
 *                  so a query can be phrased generically (e.g. "energy mix by
 *                  fuel" → Technology) and still hit the right column.
 *
 * ⚠️ TERMINOLOGY TRAPS (verified against the schema + resolvers, 2026-09-20):
 * - **Technology** (`source` → `technology_id`) is THE energy-source / fuel
 *   dimension (Diesel, Solar, Wind, Hydro…). This is the canonical, proper term
 *   for "different energy sources"; "energy source"/"fuel" are synonyms of it.
 * - **Category** (`type` → `category_id`) is the renewable classification
 *   (Renewable / Non-Renewable); it is DERIVED as parent(technology), not sliced
 *   directly. "Energy type" is Category, NOT Technology — do not conflate.
 * - **Asset Class** (`resource_type` → `asset_class_id`) is the unit/asset type,
 *   a DISTINCT dimension. Despite the canonical name `resource_type`, it is NOT
 *   the energy resource — so "energy source"/"fuel" must NOT resolve here.
 */

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

export interface DimensionDef {
  field: DimensionField;
  scopeKey: string;
  listName: string;
  allMember: number;
  label: string;
  /** camelCase property name used in resolver/worker `dims`/scope objects. */
  codeAlias: string;
  /** lowercase natural-language terms (besides scopeKey/field/label/codeAlias)
   *  that resolve to this dimension. Kept collision-free across dimensions. */
  synonyms: string[];
}

/**
 * The 10 canonical dimensions, in canonical order. This is the ONLY place the
 * (scopeKey ⇄ column ⇄ list ⇄ allMember ⇄ codeAlias) tuple is defined.
 */
export const DIMENSIONS: readonly DimensionDef[] = [
  {
    field: "provider_id", scopeKey: "provider", listName: "Provider", allMember: 20,
    label: "Provider", codeAlias: "energyProvider",
    synonyms: ["provider", "energy provider", "owner", "operator", "generator owner"],
  },
  {
    field: "category_id", scopeKey: "type", listName: "Category", allMember: 30,
    label: "Category", codeAlias: "energyType",
    synonyms: ["category", "energy type", "energy category", "renewable classification", "renewable status"],
  },
  {
    field: "technology_id", scopeKey: "source", listName: "Technology", allMember: 40,
    label: "Technology", codeAlias: "energySource",
    // The energy-source / fuel dimension. Broadest synonym set on purpose so
    // generic phrasings ("energy mix", "by fuel", "generation source") resolve here.
    synonyms: ["technology", "energy source", "fuel", "fuel type", "generation source", "generation technology", "energy mix", "source of generation"],
  },
  {
    field: "asset_class_id", scopeKey: "resource_type", listName: "Asset Class", allMember: 983,
    label: "Asset Class", codeAlias: "unitType",
    synonyms: ["asset class", "unit type", "asset type", "plant type"],
  },
  {
    field: "customer_type_id", scopeKey: "customer_type", listName: "Customer Type", allMember: 690,
    label: "Customer Type", codeAlias: "customerType",
    synonyms: ["customer type", "customer category", "customer segment", "customer class"],
  },
  {
    field: "payment_mode_id", scopeKey: "payment_mode", listName: "Payment Mode", allMember: 720,
    label: "Payment Mode", codeAlias: "paymentMode",
    synonyms: ["payment mode", "payment method", "billing mode", "prepaid", "postpaid"],
  },
  {
    field: "consumption_band_id", scopeKey: "band", listName: "Consumption Band", allMember: 1005,
    label: "Consumption Band", codeAlias: "consumptionBand",
    synonyms: ["consumption band", "usage band", "consumption tier", "usage tier", "consumption bracket"],
  },
  {
    field: "division_id", scopeKey: "division", listName: "Division", allMember: 1011,
    label: "Division", codeAlias: "division",
    synonyms: ["division", "business division", "business unit", "department"],
  },
  {
    field: "gender_id", scopeKey: "gender", listName: "Gender", allMember: 1022,
    label: "Gender", codeAlias: "gender",
    synonyms: ["gender", "sex"],
  },
  {
    field: "utility_function_id", scopeKey: "utility_function", listName: "Utility Function", allMember: 1023,
    label: "Utility Function", codeAlias: "utilityFunction",
    synonyms: ["utility function", "function", "value chain", "business function", "generation transmission distribution"],
  },
];

/** Canonical scope-key union (the `measure_dimension_scope.dimension` values). */
export type DimensionScopeKey = (typeof DIMENSIONS)[number]["scopeKey"];

/** Ordered list of canonical scope keys — use for a drill tool's `z.enum(...)`. */
export const CANONICAL_DIMENSIONS: readonly string[] = DIMENSIONS.map((d) => d.scopeKey);

// ── Derived lookup maps (kept for the existing public API + fast access) ──────

export const SCOPE_KEY_TO_FIELD: Record<string, DimensionField> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.scopeKey, d.field]),
);

export const ALL_MEMBER_BY_FIELD: Record<DimensionField, number> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.field, d.allMember]),
) as Record<DimensionField, number>;

const BY_FIELD: Record<DimensionField, DimensionDef> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.field, d]),
) as Record<DimensionField, DimensionDef>;

const BY_SCOPE_KEY: Record<string, DimensionDef> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.scopeKey, d]),
);

/** Every recognised term → its dimension. Built once; collisions are a bug the
 *  integrity test (dimension-map.test.ts) guards against. */
const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
const BY_TERM: Map<string, DimensionDef> = (() => {
  const m = new Map<string, DimensionDef>();
  for (const d of DIMENSIONS) {
    for (const term of [d.scopeKey, d.field, d.label, d.codeAlias, ...d.synonyms]) {
      m.set(norm(term), d);
    }
  }
  return m;
})();

// ── Public accessors — the one resolution path all consumers should use ───────

/** Dimension by physical column, e.g. `technology_id`. */
export const dimensionByField = (field: DimensionField): DimensionDef => BY_FIELD[field];

/** Dimension by canonical scope key, e.g. `source`. Undefined if unknown. */
export const dimensionByScopeKey = (scopeKey: string): DimensionDef | undefined =>
  BY_SCOPE_KEY[scopeKey];

/**
 * Resolve any recognised term — canonical scope key, physical column, display
 * label, code alias, or a natural-language synonym ("energy source", "fuel",
 * "energy mix") — to its dimension. Case/space/hyphen/underscore-insensitive.
 * Returns undefined for an unrecognised term (never guesses).
 */
export const resolveDimension = (term: string): DimensionDef | undefined =>
  BY_TERM.get(norm(term));

/** True when `term` names a known dimension by any facet or synonym. */
export const isKnownDimension = (term: string): boolean => BY_TERM.has(norm(term));
