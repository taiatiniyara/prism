import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { resolveDlIds, dlValue, formatReportPeriodIso } from "@/lib/legacy-dl-resolver";

const trainingIds = {
  TotalEmployeesMale: 4213040167,
  TotalEmployeesFemale: 4213040168,
  TotalEmployees: 4213040169,
};

const gender = (dlName: string) => {
  if (dlName.includes("Male")) return "Male";
  if (dlName.includes("Female")) return "Female";
  return "All";
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json(authorize.message);

  const idMap = await resolveDlIds(Object.values(trainingIds));
  const prismIds = Array.from(idMap.values()).filter((id): id is number => id != null);
  if (prismIds.length === 0) return Response.json([]);

  const entries = await db.select().from(dataEntries).where(and(inArray(dataEntries.input_def_id, prismIds), eq(dataEntries.is_deleted, false)));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const inputDefs = await db.select().from(inputDefinitions).where(and(eq(inputDefinitions.is_active, true), inArray(inputDefinitions.id, prismIds)));

  const rpMap = new Map(rps.map((r) => [r.id, r]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(entries
    .filter((l) => {
      const dl = inputDefs.find((d) => d.id === l.input_def_id);
      return dl && !dl.name.includes("Total") && dl.name !== "Employees";
    })
    .map((l) => {
      const urp = rpMap.get(l.report_period_id);
      const dl = inputDefs.find((d) => d.id === l.input_def_id);
      const reportType = findItem(urp?.report_type_id ?? null);
      const division = dl?.name.replace("Male", "").replace("Female", "").trim() ?? "";
      const reportDate = formatReportPeriodIso(urp?.report_date ?? null, reportType?.name);
      return {
        "Report Type": reportType?.name,
        "Report Period": reportDate,
        "Utility ID": urp?.utility_id,
        Division: division,
        Gender: gender(dl?.name ?? ""),
        "Number of Employees": dlValue(l.value),
      };
    })
    .filter((e) => e.Division !== "Employees"));
}
