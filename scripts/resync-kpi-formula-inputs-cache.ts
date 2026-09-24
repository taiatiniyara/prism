/**
 * Resync kpi_definitions.formula_inputs (the derived JSON cache) from
 * formula_binding / formula_binding_dimension (the source of truth) for a
 * given set of KPI ids. Use after any direct formula_binding_dimension
 * correction so the two representations stay "in lockstep" per
 * db/schema/formulaBinding.ts's documented invariant.
 *
 * KPIs with NO formula_binding rows are skipped (nothing to resync from —
 * they are still legacy-JSON-only; see loadFormulaInputsFromBindings' own
 * doc comment).
 *
 *   node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89            # dry run
 *   node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89 --apply    # write
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpiDefinitions } from "@/db/schema/kpi";
import { loadFormulaInputsFromBindings } from "@/app/data-entry/kpi-worker/formula-bindings";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const kpiDefIds = args
  .filter((a) => a !== "--apply")
  .map((a) => Number(a))
  .filter((n) => Number.isInteger(n) && n > 0);

async function main() {
  if (kpiDefIds.length === 0) {
    console.error(
      "Usage: resync-kpi-formula-inputs-cache.ts <kpiDefId...> [--apply]",
    );
    process.exit(1);
  }

  const bindingsByOwner = await loadFormulaInputsFromBindings(
    "kpi",
    kpiDefIds,
  );

  const currentRows = await db
    .select({ id: kpiDefinitions.id, formula_inputs: kpiDefinitions.formula_inputs })
    .from(kpiDefinitions);
  const currentById = new Map(currentRows.map((r) => [r.id, r.formula_inputs]));

  for (const kpiDefId of kpiDefIds) {
    const derived = bindingsByOwner.get(kpiDefId);
    if (!derived) {
      console.log(
        `KPI ${kpiDefId}: SKIP — no formula_binding rows, still legacy-JSON-only.`,
      );
      continue;
    }

    const current = currentById.get(kpiDefId) ?? null;
    const unchanged = JSON.stringify(current) === JSON.stringify(derived);
    console.log(
      `KPI ${kpiDefId}: ${unchanged ? "already in sync" : "WILL UPDATE"}`,
    );
    console.log("  current:", JSON.stringify(current));
    console.log("  derived:", JSON.stringify(derived));

    if (APPLY && !unchanged) {
      await db
        .update(kpiDefinitions)
        .set({ formula_inputs: derived })
        .where(eq(kpiDefinitions.id, kpiDefId));
      console.log(`  -> written.`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
