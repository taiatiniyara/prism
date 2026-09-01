"use server";

import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { organisations } from "@/db/schema/utility";
import {
  getCurrentUser,
  resolveUtilityScopeId,
  hasGlobalUtilityAccess,
} from "@/lib/user.service";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { and, eq, or, sql } from "drizzle-orm";

export interface IncompleteKpiRow {
  kpiDefId: number;
  kpiName: string;
  unitName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  formulaText: string | null;
  reportPeriodId: number;
  reportPeriodLabel: string;
  reportTypeId: number | null;
  kpiCategoryId: number | null;
  utilityName: string;
  inputs: {
    dataEntryId: string;
    inputDefId: number;
    inputName: string;
    value: string | null;
    unitName: string | null;
  }[];
}

export async function GetIncompleteKpis(): Promise<IncompleteKpiRow[]> {
  const user = await getCurrentUser();
  const scopeId = resolveUtilityScopeId(user);

  const rpWhere =
    scopeId != null ? [eq(reportPeriods.utility_id, scopeId)] : [];

  const periods = await db
    .select({
      id: reportPeriods.id,
      report_date: reportPeriods.report_date,
      report_type_id: reportPeriods.report_type_id,
      utility_id: reportPeriods.utility_id,
      utility_name: organisations.name,
      utility_acronym: organisations.acronym,
      report_type_name: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .leftJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    )
    .where(and(...rpWhere))
    .orderBy(reportPeriods.report_date);

  if (periods.length === 0) {
    return [];
  }

  const kpiVisibilityFilter = (() => {
    if (hasGlobalUtilityAccess(user)) {
      return null;
    }

    if (user.org_id == null) {
      return sql`1 = 0`;
    }

    return or(
      eq(kpiDefinitions.is_private, false),
      eq(kpiDefinitions.owner_utility_id, user.org_id),
    );
  })();

  const kpiDefWhere = [eq(kpiDefinitions.is_active, true)];
  if (kpiVisibilityFilter) {
    kpiDefWhere.push(kpiVisibilityFilter);
  }

  const kpiDefs = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      unit_id: kpiDefinitions.unit_id,
      formula: kpiDefinitions.formula,
      formula_inputs: kpiDefinitions.formula_inputs,
      category_id: kpiDefinitions.category_id,
      subcategory_id: kpiDefinitions.subcategory_id,
    })
    .from(kpiDefinitions)
    .where(and(...kpiDefWhere));

  const mlItems = await db.select().from(managedListItems);
  const mlById = new Map(mlItems.map((m) => [m.id, m]));

  const allInputDefs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      unit_id: measureDefinitions.unit_id,
    })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));

  const inputDefById = new Map(allInputDefs.map((d) => [d.id, d]));

  const periodIds = periods.map((p) => p.id);
  const allEntries =
    periodIds.length > 0
      ? await db
          .select({
            id: dataEntries.id,
            report_period_id: dataEntries.report_period_id,
            measure_def_id: dataEntries.measure_def_id,
            value: dataEntries.value,
          })
          .from(dataEntries)
          .where(
            and(
              eq(dataEntries.is_deleted, false),
              eq(dataEntries.is_relevant, true),
            ),
          )
      : [];

  const entriesByPeriod = new Map<number, typeof allEntries>();
  for (const entry of allEntries) {
    if (entry.report_period_id == null) continue;
    const bucket = entriesByPeriod.get(entry.report_period_id) ?? [];
    bucket.push(entry);
    entriesByPeriod.set(entry.report_period_id, bucket);
  }

  const results: IncompleteKpiRow[] = [];

  for (const period of periods) {
    const periodEntries = entriesByPeriod.get(period.id) ?? [];
    const periodEntryByInputDef = new Map<number, (typeof allEntries)[0]>();
    for (const entry of periodEntries) {
      if (!periodEntryByInputDef.has(entry.measure_def_id)) {
        periodEntryByInputDef.set(entry.measure_def_id, entry);
      }
    }

    for (const kpiDef of kpiDefs) {
      const inputDefIds = (kpiDef.formula_inputs ?? []).map(
        (fi) => fi.measure_def_id,
      );
      if (inputDefIds.length === 0) continue;

      const relevantEntries = inputDefIds
        .map((id) => periodEntryByInputDef.get(id))
        .filter((e): e is NonNullable<typeof e> => e != null);

      const hasEmpty = relevantEntries.some(
        (e) => e.value == null || e.value.trim() === "",
      );

      if (!hasEmpty) continue;

      results.push({
        kpiDefId: kpiDef.id,
        kpiName: kpiDef.name,
        unitName:
          (kpiDef.unit_id != null ? mlById.get(kpiDef.unit_id)?.name : null) ??
          null,
        categoryName:
          (kpiDef.category_id != null
            ? mlById.get(kpiDef.category_id)?.name
            : null) ?? null,
        subcategoryName:
          (kpiDef.subcategory_id != null
            ? mlById.get(kpiDef.subcategory_id)?.name
            : null) ?? null,
        formulaText: kpiDef.formula,
        reportPeriodId: period.id,
        reportPeriodLabel: formatReportPeriodDisplay(
          period.report_date,
          period.report_type_name,
        ),
        reportTypeId: period.report_type_id ?? null,
        kpiCategoryId: kpiDef.category_id ?? null,
        utilityName: period.utility_acronym ?? period.utility_name ?? "",
        inputs: relevantEntries.map((e) => {
          const def = inputDefById.get(e.measure_def_id);
          return {
            dataEntryId: e.id,
            inputDefId: e.measure_def_id,
            inputName: def?.name ?? `ID ${e.measure_def_id}`,
            value: e.value,
            unitName: def?.unit_id
              ? (mlById.get(def.unit_id)?.name ?? null)
              : null,
          };
        }),
      });
    }
  }

  return results;
}
