import { and, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpi } from "@/db/schema/kpi";

interface PersistKpiResultParams {
  reportPeriodId: number;
  kpiDefId: number;
  actualValue: string;
  formulaVersion: string;
  targetValue?: string | null;
  comments?: string | null;
}

export const upsertCalculatedKpiValue = async (
  params: PersistKpiResultParams,
): Promise<void> => {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: kpi.id })
      .from(kpi)
      .where(
        and(
          eq(kpi.report_period_id, params.reportPeriodId),
          eq(kpi.kpi_def_id, params.kpiDefId),
        ),
      )
      .limit(1)
      .for("update");

    const payload = {
      report_period_id: params.reportPeriodId,
      kpi_def_id: params.kpiDefId,
      actual_value: params.actualValue,
      target_value: params.targetValue ?? null,
      comments: params.comments ?? null,
      is_relevant: true,
      calculation_formula_version: params.formulaVersion,
      calculated_at: new Date(),
      updated_at: new Date(),
    };

    if (existing) {
      await tx.update(kpi).set(payload).where(eq(kpi.id, existing.id));

      console.info("[KPI worker] KPI table write success", {
        operation: "update",
        kpiRowId: existing.id,
        reportPeriodId: params.reportPeriodId,
        kpiDefId: params.kpiDefId,
        actualValue: params.actualValue,
        formulaVersion: params.formulaVersion,
      });

      return;
    }

    const [inserted] = await tx
      .insert(kpi)
      .values({
        ...payload,
        is_favourite: false,
      })
      .returning({ id: kpi.id });

    console.info("[KPI worker] KPI table write success", {
      operation: "insert",
      kpiRowId: inserted?.id ?? null,
      reportPeriodId: params.reportPeriodId,
      kpiDefId: params.kpiDefId,
      actualValue: params.actualValue,
      formulaVersion: params.formulaVersion,
    });
  });
};
