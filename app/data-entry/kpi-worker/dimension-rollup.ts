import type { FormulaInput } from "@/db/schema/dataEntry";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";

/**
 * The pure dimension / grain rollup engine — the rules that turn a set of
 * `data_entries` rows for one measure into a single value for a formula
 * variable. Extracted verbatim from `resolveInputs.ts` so it can be
 * unit-tested without a database; `resolveFormulaInputValues` supplies the
 * rows (from whatever source) and calls these.
 *
 * The ruling (spec §4.6, #8, PR #104): for each input,
 *   1. an authoritative All-member (or legacy-null) aggregate row  → USE it
 *   2. else genuine member slices exist                           → SUM them
 *   3. else                                                       → missing
 * One source is ever consulted, never added across — so a mandatory All row
 * coexisting with an optional partial breakdown never double-counts.
 */

export interface RollupCandidate {
  value: string | null;
  isDeleted: boolean;
  isRelevant: boolean;
  energyProviderId: number | null;
  energyTypeId: number | null;
  energySourceId: number | null;
  unitTypeId: number | null;
  customerTypeId: number | null;
  paymentModeId: number | null;
  consumptionBandId: number | null;
  divisionId: number | null;
  genderId: number | null;
  utilityFunctionId: number | null;
  // Sub-utility grain chain (unit → power station → service area → utility).
  // Distinct from the tag dimensions above; used for grain rollup, not slicing.
  grainAreaId: number | null;
  grainStationId: number | null;
  grainUnitId: number | null;
}

/** The evaluation-scope dimension fallbacks the resolver threads through. */
export interface RollupScope {
  customerTypeId?: number | null;
  paymentModeId?: number | null;
}

export const asNumber = (value: string | null): number | null => {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Medallion dimension match (doc §0.4). A binding is authoritative and exact,
 * except that an All-member binding also matches legacy NULL-tagged rows during
 * the transition. An unbound dimension falls back to the evaluation scope (for
 * the dims the scope carries) and otherwise to the All member.
 *
 * `actual === allMember || actual == null` is a strict superset of the old
 * "require NULL" rule: All-member ids don't exist on un-migrated rows, so this
 * returns identical candidates on today's NULL-tagged data and resolves
 * correctly once rows carry explicit All-member ids.
 */
export const matchDimension = (
  actual: number | null,
  bound: number | null,
  scopeValue: number | null,
  allMember: number,
): boolean => {
  if (bound != null) {
    return bound === allMember
      ? actual === allMember || actual == null
      : actual === bound;
  }
  if (scopeValue != null) {
    return actual === scopeValue || actual === allMember || actual == null;
  }
  return actual === allMember || actual == null;
};

export const sumRollupValues = (
  rows: RollupCandidate[],
): { sum: number; hasValue: boolean } => {
  let sum = 0;
  let hasValue = false;

  for (const row of rows) {
    if (row.isDeleted || !row.isRelevant) {
      continue;
    }

    const numeric = asNumber(row.value);
    if (numeric == null) {
      continue;
    }

    sum += numeric;
    hasValue = true;
  }

  return { sum, hasValue };
};

/** Strata rollup fires when the KPI's aggregation level is coarser than the input's. */
export const strataShouldRollup = (
  kpiAggLevelId: number | null,
  inputAggLevelId: number | null,
): boolean => {
  if (kpiAggLevelId == null || inputAggLevelId == null) {
    return false;
  }

  return kpiAggLevelId > inputAggLevelId;
};

/**
 * Finest populated grain column on a row: unit(3) > station(2) > area(1) >
 * utility-aggregate(0).
 */
export const rankGrainLevel = (candidate: RollupCandidate): number =>
  candidate.grainUnitId != null
    ? 3
    : candidate.grainStationId != null
      ? 2
      : candidate.grainAreaId != null
        ? 1
        : 0;

export interface GrainSelection {
  candidates: RollupCandidate[];
  /** true when the selected rows must be summed (a finer level was rolled up). */
  summed: boolean;
  /** finer grain levels present when the invariant is violated (mixed levels). */
  mixedLevels: number[];
}

/**
 * Pick the rows to consult for grain rollup. Prefer the authoritative
 * target-level (utility) aggregate; else Σ the COARSEST single level present
 * below target — never mixing levels, which would double count. Only meaningful
 * when the target is the utility (`rollUpGrain`).
 */
export const selectGrainCandidates = (
  rows: RollupCandidate[],
  rollUpGrain: boolean,
): GrainSelection => {
  if (!rollUpGrain || rows.length === 0) {
    return { candidates: rows, summed: false, mixedLevels: [] };
  }

  const aggregateRows = rows.filter((c) => rankGrainLevel(c) === 0);
  if (aggregateRows.length > 0) {
    return { candidates: aggregateRows, summed: false, mixedLevels: [] };
  }

  const finerRanks = [
    ...new Set(rows.map(rankGrainLevel).filter((rank) => rank > 0)),
  ].sort((a, b) => a - b);
  const coarsest = finerRanks[0];
  return {
    candidates: rows.filter((c) => rankGrainLevel(c) === coarsest),
    summed: true,
    mixedLevels: finerRanks.length > 1 ? finerRanks : [],
  };
};

type MatchFn = (
  actual: number | null,
  bound: number | null | undefined,
  allMember: number,
  scopeValue?: number | null,
) => boolean;

// strict: an All-binding matches the All-member (or legacy null) aggregate only.
const strict: MatchFn = (actual, bound, allMember, scopeValue = null) =>
  matchDimension(actual, bound ?? null, scopeValue, allMember);

// detail: an All-binding (with no pinning scope value) matches ANY member on
// that dimension — so the sum is the dimension rollup across present members.
// Reached ONLY when rule 1 found no authoritative aggregate.
const detail: MatchFn = (actual, bound, allMember, scopeValue = null) => {
  if (scopeValue == null && bound != null && bound === allMember) {
    return true;
  }
  return matchDimension(actual, bound ?? null, scopeValue, allMember);
};

const candidateMatchesBinding = (
  c: RollupCandidate,
  binding: FormulaInput,
  scope: RollupScope,
  match: MatchFn,
): boolean =>
  match(c.energyProviderId, binding.provider_id, ALL_MEMBER.provider_id) &&
  match(c.energyTypeId, binding.category_id, ALL_MEMBER.category_id) &&
  match(c.energySourceId, binding.technology_id, ALL_MEMBER.technology_id) &&
  match(c.unitTypeId, binding.asset_class_id, ALL_MEMBER.asset_class_id) &&
  match(
    c.customerTypeId,
    binding.customer_type_id,
    ALL_MEMBER.customer_type_id,
    scope.customerTypeId ?? null,
  ) &&
  match(
    c.paymentModeId,
    binding.payment_mode_id,
    ALL_MEMBER.payment_mode_id,
    scope.paymentModeId ?? null,
  ) &&
  match(
    c.consumptionBandId,
    binding.consumption_band_id,
    ALL_MEMBER.consumption_band_id,
  ) &&
  match(c.divisionId, binding.division_id, ALL_MEMBER.division_id) &&
  match(c.genderId, binding.gender_id, ALL_MEMBER.gender_id) &&
  match(
    c.utilityFunctionId,
    binding.utility_function_id,
    ALL_MEMBER.utility_function_id,
  );

export interface PickInputArgs {
  candidateRows: RollupCandidate[];
  binding: FormulaInput;
  scope: RollupScope;
  /** true when grain OR strata rollup applies — the aggregate path sums. */
  grainRollup: boolean;
}

/**
 * The rule 1 → 2 → 3 preference for one formula input over its pre-filtered
 * candidate rows. Returns the resolved numeric value or `null` (missing).
 */
export const pickInputValue = ({
  candidateRows,
  binding,
  scope,
  grainRollup,
}: PickInputArgs): number | null => {
  // Rule 1 — authoritative All-member aggregate.
  const strictCandidates = candidateRows.filter((c) =>
    candidateMatchesBinding(c, binding, scope, strict),
  );

  let value: number | null;
  if (grainRollup) {
    const rollup = sumRollupValues(strictCandidates);
    value = rollup.hasValue ? rollup.sum : null;
  } else {
    // A scope can hold several copies of a row (blank placeholders, legacy
    // imports); take the first that actually carries a number.
    value =
      strictCandidates
        .map((candidate) => asNumber(candidate.value))
        .find((v) => v != null) ?? null;
  }

  // Rule 2 — no aggregate row: dimension rollup = sum the detail slices.
  if (value == null) {
    const detailCandidates = candidateRows.filter((c) =>
      candidateMatchesBinding(c, binding, scope, detail),
    );
    const rollup = sumRollupValues(detailCandidates);
    if (rollup.hasValue) value = rollup.sum;
  }

  // Rule 3 — missing → null.
  return value;
};
