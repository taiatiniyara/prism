import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { resolveDlIds, dlValue, formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";

const trainingIds = {
  GenderOfCeo: 4213040135,
  GenderOf2ic: 4213040136,
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const idMap = await resolveDlIds(Object.values(trainingIds));
  const prismIds = Array.from(idMap.values()).filter((id): id is number => id != null);
  if (prismIds.length === 0) return Response.json([]);

  const entries = await db.select().from(dataEntries).where(and(inArray(dataEntries.input_def_id, prismIds), eq(dataEntries.is_deleted, false)));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const orgs = await db.select().from(organisations).where(eq(organisations.is_active, true));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const inputDefs = await db.select().from(inputDefinitions).where(and(eq(inputDefinitions.is_active, true), inArray(inputDefinitions.id, prismIds)));

  const rpMap = new Map(rps.map((r) => [r.id, r]));
  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  const list: Record<string, unknown>[] = [];
  for (const l of entries) {
    const urp = rpMap.get(l.report_period_id);
    const reportType = findItem(urp?.report_type_id ?? null);
    const dl = inputDefs.find((d) => d.id === l.input_def_id);
    const utility = urp ? orgMap.get(urp.utility_id) : undefined;
    list.push({
      ReportType: reportType?.name,
      ReportPeriod: formatReportPeriodIso(urp?.report_date ?? null, reportType?.name),
      UtilityId: urp?.utility_id,
      Utility: utility?.name ?? "",
      Position: dl?.name.split(" ").pop() ?? "",
      Gender: dlValue(l.value),
    });
  }

  return Response.json(list);
}
