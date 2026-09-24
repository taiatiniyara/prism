import type { FormulaInput } from "@/db/schema/dataEntry";
import { DIMENSIONS } from "@/lib/dimensions/dimension-map";

type DimensionSliceInput = Pick<
  FormulaInput,
  | "provider_id"
  | "category_id"
  | "technology_id"
  | "asset_class_id"
  | "customer_type_id"
  | "payment_mode_id"
  | "consumption_band_id"
  | "division_id"
  | "gender_id"
  | "utility_function_id"
>;

/**
 * Human-readable label for the dimension slice a formula binding pins, e.g.
 * "Finance • Female" or "Transmission". Returns null when every dimension is
 * the canonical All-member (the binding reads the whole measure — no slice
 * to label).
 *
 * Fixes the "a lot of inputs look repeated" report: many KPIs legitimately
 * bind the SAME measure multiple times, once per dimension slice (e.g. one
 * entry per division for "Total Employees Female" — 9 correct, distinct
 * values). The review-kpi Inputs card only ever showed the measure's bare
 * name, so all N slices looked visually identical even though the
 * underlying data was correct. This label disambiguates them.
 */
export const computeSliceLabel = (
  formulaInput: DimensionSliceInput,
  memberNameById: Map<number, string>,
): string | null => {
  const parts: string[] = [];

  for (const dimension of DIMENSIONS) {
    const memberId = formulaInput[dimension.field];
    if (memberId == null || memberId === dimension.allMember) {
      continue;
    }

    const name = memberNameById.get(memberId);
    if (name) {
      parts.push(name);
    }
  }

  return parts.length > 0 ? parts.join(" • ") : null;
};