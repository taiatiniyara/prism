import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

const LEADERSHIP_MEASURE_NAMES = [
  "CEO Gender",
  "2IC (2nd in Command) Gender",
] as const;

const POSITION_BY_MEASURE: Record<string, string> = {
  "CEO Gender": "CEO",
  "2IC (2nd in Command) Gender": "2IC",
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...LEADERSHIP_MEASURE_NAMES]));

  const prismIds = measureDefs.map((m) => m.id);
  if (prismIds.length === 0) return Response.json([]);

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, prismIds),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));
  const orgs = await db
    .select()
    .from(organisations)
    .where(eq(organisations.is_active, true));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    prismIds,
  );

  const nameById = new Map(measureDefs.map((d) => [d.id, d.name]));
  const rpMap = new Map(rps.map((r) => [r.id, r]));
  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  const list: Record<string, unknown>[] = [];
  for (const l of entries) {
    const urp = rpMap.get(l.report_period_id);
    const reportType = findItem(urp?.report_type_id ?? null);
    const name = nameById.get(l.measure_def_id) ?? "";
    const utility = urp ? orgMap.get(urp.utility_id) : undefined;
    list.push({
      ReportType: reportType?.name,
      ReportPeriod: formatReportPeriodIso(
        urp?.report_date ?? null,
        reportType?.name,
      ),
      UtilityId: urp?.utility_id,
      Utility: utility?.name ?? "",
      Position: POSITION_BY_MEASURE[name] ?? name,
      Gender: resolveEntryValue(
        l,
        dataTypeNameById.get(l.measure_def_id) ?? null,
        itemsById,
      ),
    });
  }

  return Response.json(list);
}
