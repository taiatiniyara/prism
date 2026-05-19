"use server";

import { db } from "@/db/connection";
import {
  dataEntries,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { organisations } from "@/db/schema/utility";
import {
  getCurrentUser,
  resolveUtilityScopeId,
} from "@/lib/user.service";
import { and, eq } from "drizzle-orm";

export interface IncompleteKpiRow {
  kpiDefId: number;
  kpiName: string;
  unitName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  formulaText: string | null;
  reportPeriodId: number;
  reportPeriodLabel: string;
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

  const rpWhere = scopeId != null
    ? [eq(reportPeriods.utility_id, scopeId)]
    : [];

  const periods = await db
    .select({
      id: reportPeriods.id,
      report_date: reportPeriods.report_date,
      utility_id: reportPeriods.utility_id,
      utility_name: organisations.name,
      utility_acronym: organisations.acronym,
      report_type_name: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .leftJoin(managedListItems, eq(reportPeriods.report_type_id, managedListItems.id))
    .where(and(...rpWhere))
    .orderBy(reportPeriods.report_date);

  if (periods.length === 0) {
    return [];
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
    .where(eq(kpiDefinitions.is_active, true));

  const mlItems = await db.select().from(managedListItems);
  const mlById = new Map(mlItems.map((m) => [m.id, m]));

  const results: IncompleteKpiRow[] = [];

  for (const period of periods) {
    for (const kpiDef of kpiDefs) {
      const inputDefIds = (kpiDef.formula_inputs ?? []).map(
        (fi) => fi.input_def_id,
      );
      if (inputDefIds.length === 0) continue;

      const entries = await db
        .select({
          id: dataEntries.id,
          input_def_id: dataEntries.input_def_id,
          value: dataEntries.value,
        })
        .from(dataEntries)
        .where(
          and(
            eq(dataEntries.report_period_id, period.id),
            eq(dataEntries.is_deleted, false),
            eq(dataEntries.is_relevant, true),
          ),
        );

      const relevantEntries = entries.filter((e) =>
        inputDefIds.includes(e.input_def_id),
      );

      const hasEmpty = relevantEntries.some(
        (e) => e.value == null || e.value.trim() === "",
      );

      if (!hasEmpty) continue;

      const allInputDefs = await db
        .select({
          id: inputDefinitions.id,
          name: inputDefinitions.name,
          unit_id: inputDefinitions.unit_id,
        })
        .from(inputDefinitions)
        .where(
          and(
            eq(inputDefinitions.is_active, true),
          ),
        );

      const inputDefById = new Map(allInputDefs.map((d) => [d.id, d]));

      results.push({
        kpiDefId: kpiDef.id,
        kpiName: kpiDef.name,
        unitName: (kpiDef.unit_id != null ? mlById.get(kpiDef.unit_id)?.name : null) ?? null,
        categoryName: (kpiDef.category_id != null ? mlById.get(kpiDef.category_id)?.name : null) ?? null,
        subcategoryName: (kpiDef.subcategory_id != null ? mlById.get(kpiDef.subcategory_id)?.name : null) ?? null,
        formulaText: kpiDef.formula,
        reportPeriodId: period.id,
        reportPeriodLabel: period.report_date.toISOString().split("T")[0],
        utilityName: period.utility_acronym ?? period.utility_name ?? "",
        inputs: relevantEntries.map((e) => {
          const def = inputDefById.get(e.input_def_id);
          return {
            dataEntryId: e.id,
            inputDefId: e.input_def_id,
            inputName: def?.name ?? `ID ${e.input_def_id}`,
            value: e.value,
            unitName: def?.unit_id ? mlById.get(def.unit_id)?.name ?? null : null,
          };
        }),
      });
    }
  }

  return results;
}
