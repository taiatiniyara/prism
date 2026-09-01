import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  formatReportPeriodIso,
} from "@/lib/legacy/legacy-dl-resolver";
import { resolveEntryValue } from "@/lib/legacy/entry-value";
import { getResolvedContextRows } from "@/lib/legacy/context-data";

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

  // "Fuel Supply Access" (measure 15) is a country-context metric — it lives in
  // country_context, not data_entries. Pull it through the read bridge and
  // carry it onto the utility's row via utility → country.
  const ctxRows = await getResolvedContextRows(221);
  const allUtils = await db
    .select({ id: organisations.id, countryId: organisations.country_id })
    .from(organisations);
  const countryByUtility = new Map(allUtils.map((u) => [u.id, u.countryId]));

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
      const countryId = countryByUtility.get(urp.utility_id);
      const fsa =
        ctxRows.find(
          (r) =>
            r.report_period_id === urp.id &&
            r.country_id === (countryId ?? -1) &&
            r.measureName === "Fuel Supply Access",
        ) ?? null;
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        ReportPeriodId: urp.id,
        UtilityId: urp.utility_id,
        ...ucData,
        "Fuel Supply Access": fsa?.value ?? null,
      };
    }),
  );
}
