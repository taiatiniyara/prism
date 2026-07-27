import { inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import { managedListItems } from "@/db/schema/managedLists";

/**
 * Energy-taxonomy derivation (derive-not-store).
 *
 * The energy taxonomy is a strict hierarchy in `managed_list_items.parent_id`:
 *   asset (Generation/Storage) → category (Renewable/Conventional/Storage) → technology (Solar/Diesel/…)
 *
 * A `units` row stores ONLY its leaf `technology_id`; its category and asset are
 * pure functions of it — category = parent(technology), asset = grandparent(technology).
 * They are therefore NOT stored on `units` (the old `units.category_id` /
 * `units.type_id` columns are dropped); anything that needs them derives here.
 *
 * (Data verified 2026-07-28: all 409 real units resolve technology → category →
 * asset with 0 breaks; virtual units sit at All/All/All.)
 */

/** Build an id → parent_id lookup from a preloaded `managed_list_items` list. */
export function buildParentMap(
  items: { id: number; parent_id: number | null }[],
): Map<number, number | null> {
  return new Map(items.map((i) => [i.id, i.parent_id]));
}

/** category = parent(technology). In-memory (uses a preloaded parent map). */
export function categoryFromTechnology(
  technologyId: number | null,
  parentById: Map<number, number | null>,
): number | null {
  if (technologyId == null) return null;
  return parentById.get(technologyId) ?? null;
}

/** asset = grandparent(technology) = parent(parent(technology)). In-memory. */
export function assetFromTechnology(
  technologyId: number | null,
  parentById: Map<number, number | null>,
): number | null {
  const categoryId = categoryFromTechnology(technologyId, parentById);
  if (categoryId == null) return null;
  return parentById.get(categoryId) ?? null;
}

export type EnergyClass = {
  categoryId: number | null;
  assetClassId: number | null;
};

/**
 * DB batch: derive { categoryId, assetClassId } for a set of `technology_id`s by
 * walking `managed_list_items.parent_id` up two levels. Two queries total,
 * regardless of input size (no N+1). Use this where the caller has NOT already
 * loaded the full `managed_list_items` table; otherwise prefer the in-memory
 * helpers above with `buildParentMap`.
 */
export async function deriveEnergyClassByTechnology(
  technologyIds: (number | null)[],
): Promise<Map<number, EnergyClass>> {
  const techIds = Array.from(
    new Set(technologyIds.filter((id): id is number => id != null)),
  );
  const out = new Map<number, EnergyClass>();
  if (techIds.length === 0) return out;

  const techRows = await db
    .select({ id: managedListItems.id, parent_id: managedListItems.parent_id })
    .from(managedListItems)
    .where(inArray(managedListItems.id, techIds));
  const categoryByTech = new Map(techRows.map((r) => [r.id, r.parent_id]));

  const categoryIds = Array.from(
    new Set(
      techRows
        .map((r) => r.parent_id)
        .filter((id): id is number => id != null),
    ),
  );
  const catRows = categoryIds.length
    ? await db
        .select({
          id: managedListItems.id,
          parent_id: managedListItems.parent_id,
        })
        .from(managedListItems)
        .where(inArray(managedListItems.id, categoryIds))
    : [];
  const assetByCategory = new Map(catRows.map((r) => [r.id, r.parent_id]));

  for (const techId of techIds) {
    const categoryId = categoryByTech.get(techId) ?? null;
    const assetClassId =
      categoryId != null ? (assetByCategory.get(categoryId) ?? null) : null;
    out.set(techId, { categoryId, assetClassId });
  }
  return out;
}
