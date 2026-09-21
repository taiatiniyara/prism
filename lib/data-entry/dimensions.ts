import {
  ALL_MEMBER_BY_FIELD,
  type DimensionField,
} from "@/lib/dimensions/dimension-map";

/**
 * Canonical "All" member id for each of the ten NOT-NULL dimension columns on
 * `data_entries` (medallion schema — see `docs/schema-redesign-medallion.md` §1.2).
 *
 * Every write to `data_entries` must supply all ten dimension columns. Where a
 * dimension is not sliced, the row carries that dimension's **All** member id
 * explicitly — never NULL and never a silent zero (design principle §0.4,
 * "No NULL-as-All").
 *
 * The ids (and the column set) are sourced from the single dimension map at
 * `lib/dimensions/dimension-map.ts` — do NOT hard-code a second copy here.
 */
export const ALL_MEMBER: Record<DimensionField, number> = ALL_MEMBER_BY_FIELD;

export type DimensionMembers = Record<DimensionField, number>;

/**
 * A partial slice of dimension members, keyed by column name. Any dimension left
 * out — or set to `null` / `undefined` / `0` (the UI "not sliced" sentinel) —
 * falls back to that dimension's canonical All member.
 */
export type DimensionSlice = Partial<
  Record<keyof DimensionMembers, number | null | undefined>
>;

const orAll = (
  value: number | null | undefined,
  allMember: number,
): number => (value == null || value === 0 ? allMember : value);

/**
 * Builds the ten NOT-NULL dimension columns for a `data_entries` row, filling in
 * each dimension's canonical All member for any dimension the caller has not
 * sliced. Use this so every insert/update supplies all ten dimensions explicitly.
 */
export function buildDimensionMembers(
  slice: DimensionSlice = {},
): DimensionMembers {
  return {
    provider_id: orAll(
      slice.provider_id,
      ALL_MEMBER.provider_id,
    ),
    category_id: orAll(slice.category_id, ALL_MEMBER.category_id),
    technology_id: orAll(
      slice.technology_id,
      ALL_MEMBER.technology_id,
    ),
    asset_class_id: orAll(
      slice.asset_class_id,
      ALL_MEMBER.asset_class_id,
    ),
    customer_type_id: orAll(
      slice.customer_type_id,
      ALL_MEMBER.customer_type_id,
    ),
    payment_mode_id: orAll(
      slice.payment_mode_id,
      ALL_MEMBER.payment_mode_id,
    ),
    consumption_band_id: orAll(
      slice.consumption_band_id,
      ALL_MEMBER.consumption_band_id,
    ),
    division_id: orAll(slice.division_id, ALL_MEMBER.division_id),
    gender_id: orAll(slice.gender_id, ALL_MEMBER.gender_id),
    utility_function_id: orAll(
      slice.utility_function_id,
      ALL_MEMBER.utility_function_id,
    ),
  };
}
