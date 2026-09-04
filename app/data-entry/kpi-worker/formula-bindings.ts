import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import {
  formulaBinding,
  formulaBindingDimension,
  type FormulaBindingOwnerKind,
} from "@/db/schema/formulaBinding";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";

const DIMENSION_KEYS = Object.keys(ALL_MEMBER) as Array<keyof typeof ALL_MEMBER>;

/**
 * One `formula_binding` row + its `formula_binding_dimension` rows → the flat
 * `FormulaInput` the resolver consumes.
 *
 * A NULL `member_id` (Inherit) and a dimension with no row both compile to the
 * dimension's All-member — identical to how `formula_inputs` JSON is derived
 * from the same tables at save time.
 */
export const bindingToFormulaInput = (
  binding: { input_measure_def_id: number; variable_name: string },
  dimensions: Array<{ dimension_key: string; member_id: number | null }>,
): FormulaInput => {
  const pinnedByKey = new Map(
    dimensions.map((d) => [d.dimension_key, d.member_id]),
  );

  const formulaInput: FormulaInput = {
    measure_def_id: binding.input_measure_def_id,
    variable_name: binding.variable_name,
  };
  for (const key of DIMENSION_KEYS) {
    const pinned = pinnedByKey.get(key);
    (formulaInput as unknown as Record<string, number>)[key] =
      pinned != null ? pinned : ALL_MEMBER[key];
  }
  return formulaInput;
};

/**
 * `formula_binding` is the source of truth for a formula's inputs (spec §5.3).
 * Loads them for a set of owners as `FormulaInput[]`, in `sort_order`.
 *
 * Owners with **no** binding rows are absent from the returned map — the
 * caller falls back to the legacy `formula_inputs` JSON for those (still the
 * case for KPIs awaiting the manual rebuild).
 */
export const loadFormulaInputsFromBindings = async (
  ownerKind: FormulaBindingOwnerKind,
  ownerIds: number[],
): Promise<Map<number, FormulaInput[]>> => {
  const byOwner = new Map<number, FormulaInput[]>();
  if (ownerIds.length === 0) return byOwner;

  const bindings = await db
    .select()
    .from(formulaBinding)
    .where(
      and(
        eq(formulaBinding.owner_kind, ownerKind),
        inArray(formulaBinding.owner_id, ownerIds),
      ),
    )
    .orderBy(asc(formulaBinding.sort_order));
  if (bindings.length === 0) return byOwner;

  const dimensionRows = await db
    .select()
    .from(formulaBindingDimension)
    .where(
      inArray(
        formulaBindingDimension.binding_id,
        bindings.map((b) => b.id),
      ),
    );

  const dimensionsByBinding = new Map<number, typeof dimensionRows>();
  for (const row of dimensionRows) {
    const list = dimensionsByBinding.get(row.binding_id) ?? [];
    list.push(row);
    dimensionsByBinding.set(row.binding_id, list);
  }

  for (const binding of bindings) {
    const list = byOwner.get(binding.owner_id) ?? [];
    list.push(
      bindingToFormulaInput(
        binding,
        dimensionsByBinding.get(binding.id) ?? [],
      ),
    );
    byOwner.set(binding.owner_id, list);
  }
  return byOwner;
};
