import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  formatReportPeriodIso,
} from "@/lib/legacy/legacy-dl-resolver";
import { resolveEntryValue } from "@/lib/legacy/entry-value";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const entries = await db
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false));
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_group_id, 203),
      ),
    );

  const dlMap = new Map(inputDefs.map((d) => [d.id, d]));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map(
    inputDefs.map((d) => [d.id, itemsById.get(d.data_type_id) ?? null]),
  );
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  // Legacy (p1) labels for measures whose catalogue name drifted from the
  // p1 semantic-model name. Keyed by the p2 measure-name.
  const GOVERNANCE_RENAMES: Record<string, string> = {
    "Are line/sector Ministers or Public Servants appointed to the Board?":
      "Are Ministers or Public Servants representing the line/sector Ministry appointed to the Board?",
  };

  // Emission order mirrors prism-training's /api/factGovernance question order.
  const GOVERNANCE_COLUMN_ORDER = [
    "Is the Strategic Plan implemented?",
    "Does the Strategic Plan include three or more years of forecasts?",
    "Has a Strategic Plan been adopted?",
    "Does the CEO's Performance Contract include Annual Reviews?",
    "Is the CEO on a Performance Contract?",
    "Are Ministers or Public Servants representing the line/sector Ministry appointed to the Board?",
    "Are Ministers appointed to the Board?",
    "Is a Commercial Mandate implemented?",
    "Is a Commercial Mandate in place?",
    "Is a Code of Conduct implemented?",
    "Is a Code of Conduct in place?",
    "Is the Annual Report audited?",
    "Does the Annual Report disclose performance relative to the Strategic Plan?",
    "Is the Annual Report completed within four months of the end of the Reporting Year?",
  ];

  return Response.json(
    rps.map((urp) => {
      const values: Record<string, unknown> = {};
      for (const e of entries) {
        if (e.report_period_id !== urp.id) continue;
        const dl = dlMap.get(e.measure_def_id);
        const label = dl
          ? (GOVERNANCE_RENAMES[dl.name] ?? dl.name)
          : "";
        if (!label) continue;
        values[label] = resolveEntryValue(
          e,
          dataTypeNameById.get(e.measure_def_id) ?? null,
          itemsById,
        );
      }
      const dlValues: Record<string, unknown> = {};
      for (const col of GOVERNANCE_COLUMN_ORDER) {
        if (col in values) dlValues[col] = values[col];
      }
      for (const col of Object.keys(values)) {
        if (!(col in dlValues)) dlValues[col] = values[col];
      }
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        ReportPeriodId: urp.id,
        UtilityId: urp.utility_id,
        ...dlValues,
      };
    }),
  );
}
