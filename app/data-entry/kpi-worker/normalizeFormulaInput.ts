import type { FormulaInput } from "@/db/schema/dataEntry";

const toNullableNumber = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Normalizes a stored formula-input binding to the canonical `measure_def_id`
 * shape used by the resolvers.
 *
 * Historically these bindings were keyed `input_def_id`. The medallion rename
 * moved the canonical key to `measure_def_id` on `data_entries` and
 * `measure_definitions`, but never rewrote the `kpi_definitions.formula_inputs`
 * JSON blob — so legacy KPI definitions still carry `input_def_id`. We read
 * both (preferring `measure_def_id`) so a legacy blob resolves instead of being
 * silently dropped. Returns null only when neither key is a usable number.
 */
export const normalizeFormulaInput = (
  input: FormulaInput,
): FormulaInput | null => {
  const raw = input as FormulaInput & {
    measure_def_id?: unknown;
    input_def_id?: unknown;
  };
  const measureDefId =
    toNullableNumber(raw.measure_def_id) ?? toNullableNumber(raw.input_def_id);

  if (measureDefId == null) {
    return null;
  }

  const energyProviderId = toNullableNumber(input.energy_provider_id);
  const energyTypeId = toNullableNumber(input.energy_type_id);
  const energySourceId = toNullableNumber(input.energy_source_id);

  // Carry any other fields through, but drop the legacy key so the emitted
  // binding is canonical (measure_def_id only).
  const rest: Record<string, unknown> = { ...raw };
  delete rest.input_def_id;

  return {
    ...(rest as unknown as FormulaInput),
    measure_def_id: measureDefId,
    ...(energyProviderId != null
      ? { energy_provider_id: energyProviderId }
      : {}),
    ...(energyTypeId != null ? { energy_type_id: energyTypeId } : {}),
    ...(energySourceId != null ? { energy_source_id: energySourceId } : {}),
  };
};
