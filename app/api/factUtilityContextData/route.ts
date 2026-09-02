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

// Power BI column labels (measure name -> legacy semantic-model name).
const UTILITY_CONTEXT_COLUMN_LABELS: Record<string, string> = {
  "Utility Ownership Type": "Ownership Type",
};

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
        eq(measureDefinitions.measures_subgroup_id, 222),
      ),
    );
  const utilCtxMeasureIds = new Set(inputDefs.map((d) => d.id));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map(
    inputDefs.map((d) => [d.id, itemsById.get(d.data_type_id) ?? null]),
  );

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.map((urp) => {
      const ucData = entries
        .filter(
          (e) =>
            e.report_period_id === urp.id &&
            utilCtxMeasureIds.has(e.measure_def_id),
        )
        .reduce(
          (acc, e) => {
            const dl = inputDefs.find((d) => d.id === e.measure_def_id);
            const label = dl
              ? (UTILITY_CONTEXT_COLUMN_LABELS[dl.name] ?? dl.name)
              : "";
            return {
              [label]: resolveEntryValue(
                e,
                dataTypeNameById.get(e.measure_def_id) ?? null,
                itemsById,
              ),
              ...acc,
            };
          },
          {} as Record<string, unknown>,
        );
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        ReportPeriodId: urp.id,
        UtilityId: urp.utility_id,
        ...ucData,
      };
    }),
  );
}
