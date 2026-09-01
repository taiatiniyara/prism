/**
 * Descriptive-projection detection (design ruled by #8, 2026-08-31).
 *
 * Some KPIs are "measures that are also KPIs" whose value is a *choice*, not a
 * number — e.g. Accounting Standards (IFRS/GAAP), "Is the Annual Report
 * audited" (yes/no), Fuel Pricing Regulation. These are ENTERED and the KPI
 * merely PUBLISHES the entered value by reference; they are never run through
 * the numeric evaluator. A numeric "compute" of one always fails ("missing
 * formula inputs"), correctly, because there is nothing to compute.
 *
 * This is DERIVABLE — there is no stored `is_descriptive` flag (one existed and
 * was deliberately dropped in the medallion cleanup; don't resurrect it). Two
 * signals we already have decide it:
 *   - no formula/binding            ⇒ projection-by-reference (any data type);
 *   - input data_type ∈ {option,text,boolean} ⇒ a formula over a category is
 *     meaningless ⇒ Compute-now must never be offered.
 *
 * Kept as one shared predicate so the builder, the read path, and the verifier
 * dispatch identically (value-router pattern — no mode bit to drift).
 */

/** Data types whose value is categorical/descriptive rather than numeric. */
export const CATEGORICAL_DATA_TYPES = new Set(["option", "text", "boolean"]);

export function isCategoricalDataType(
  dataTypeName: string | null | undefined,
): boolean {
  return (
    dataTypeName != null &&
    CATEGORICAL_DATA_TYPES.has(dataTypeName.trim().toLowerCase())
  );
}

/**
 * A definition is a descriptive projection (surfaced by reference, never
 * numerically computed) when it has NO bound inputs, or ANY bound input is a
 * categorical measure.
 *
 * @param inputDataTypeNames data-type names of the definition's bound inputs
 *   (empty array = no binding).
 */
export function isDescriptiveProjection(
  inputDataTypeNames: (string | null | undefined)[],
): boolean {
  if (inputDataTypeNames.length === 0) return true; // no binding ⇒ by reference
  return inputDataTypeNames.some(isCategoricalDataType);
}
