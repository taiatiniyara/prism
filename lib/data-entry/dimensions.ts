/**
 * Canonical "All" member id for each of the ten NOT-NULL dimension columns on
 * `data_entries` (medallion schema — see `docs/schema-redesign-medallion.md` §1.2).
 *
 * Every write to `data_entries` must supply all ten dimension columns. Where a
 * dimension is not sliced, the row carries that dimension's **All** member id
 * explicitly — never NULL and never a silent zero (design principle §0.4,
 * "No NULL-as-All").
 */
export const ALL_MEMBER = {
  energy_provider_id: 20,
  energy_type_id: 30,
  energy_source_id: 40,
  energy_resource_type_id: 983,
  customer_type_id: 690,
  payment_mode_id: 720,
  consumption_band_id: 1005,
  division_id: 1011,
  gender_id: 1022,
  utility_function_id: 1023,
} as const;

export interface DimensionMembers {
  energy_provider_id: number;
  energy_type_id: number;
  energy_source_id: number;
  energy_resource_type_id: number;
  customer_type_id: number;
  payment_mode_id: number;
  consumption_band_id: number;
  division_id: number;
  gender_id: number;
  utility_function_id: number;
}

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
    energy_provider_id: orAll(
      slice.energy_provider_id,
      ALL_MEMBER.energy_provider_id,
    ),
    energy_type_id: orAll(slice.energy_type_id, ALL_MEMBER.energy_type_id),
    energy_source_id: orAll(
      slice.energy_source_id,
      ALL_MEMBER.energy_source_id,
    ),
    energy_resource_type_id: orAll(
      slice.energy_resource_type_id,
      ALL_MEMBER.energy_resource_type_id,
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
