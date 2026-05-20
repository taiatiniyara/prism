"use server";

import { db } from "@/db/connection";
import {
  dataEntries,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { getCurrentUser, resolveUtilityScopeId } from "@/lib/user.service";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { and, eq } from "drizzle-orm";

export interface DownloadRow {
  utility: string;
  report_type: string;
  report_period: string;
  category: string;
  subcategory: string;
  input_def_name: string;
  value: string;
  unit: string;
  status: string;
}

export async function GetDownloadData(): Promise<DownloadRow[]> {
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
      report_type_id: reportPeriods.report_type_id,
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

  const entries = await db
    .select({
      report_period_id: dataEntries.report_period_id,
      value: dataEntries.value,
      status_id: dataEntries.status_id,
      input_def_id: dataEntries.input_def_id,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
      ),
    );

  const allInputDefs = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      category_id: inputDefinitions.category_id,
      subcategory_id: inputDefinitions.subcategory_id,
      unit_id: inputDefinitions.unit_id,
    })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true));

  const mlItems = await db.select().from(managedListItems);

  const inputDefById = new Map(allInputDefs.map((d) => [d.id, d]));
  const mlById = new Map(mlItems.map((m) => [m.id, m]));

  const statusLabels: Record<number, string> = {
    1: "Requested",
    2: "Pending",
    3: "Entered",
    4: "Reviewed",
    5: "Approved",
    6: "Endorsed",
    7: "Not Available",
  };

  const rows: DownloadRow[] = [];

  for (const period of periods) {
    const periodEntries = entries.filter(
      (e) => e.report_period_id === period.id,
    );

    for (const entry of periodEntries) {
      const inputDef = inputDefById.get(entry.input_def_id);
      if (!inputDef) continue;

      const category = mlById.get(inputDef.category_id)?.name ?? "";
      const subcategory = mlById.get(inputDef.subcategory_id)?.name ?? "";
      const unit = mlById.get(inputDef.unit_id)?.name ?? "";

      rows.push({
        utility: period.utility_acronym ?? period.utility_name ?? "",
        report_type: period.report_type_name ?? "",
        report_period: formatReportPeriodDisplay(period.report_date, period.report_type_name),
        category,
        subcategory,
        input_def_name: inputDef.name,
        value: entry.value ?? "",
        unit,
        status: entry.status_id != null ? (statusLabels[entry.status_id] ?? String(entry.status_id)) : "",
      });
    }
  }

  return rows;
}
