import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, ["Employees"]));

  const employeesId = measureDefs.find((m) => m.name === "Employees")?.id;
  if (employeesId == null) return Response.json([]);

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.measure_def_id, employeesId),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext([
    employeesId,
  ]);

  // Resolve the gender dimension (Male / Female) from the Gender list.
  const genderList = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Gender"))
      .limit(1)
  )[0];
  const genderItems = genderList
    ? await db
        .select()
        .from(managedListItems)
        .where(
          and(
            eq(managedListItems.list_id, genderList.id),
            eq(managedListItems.is_active, true),
          ),
        )
    : [];
  const genderNameById = new Map(genderItems.map((g) => [g.id, g.name]));

  const rpMap = new Map(rps.map((r) => [r.id, r]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    entries.map((l) => {
      const urp = rpMap.get(l.report_period_id);
      const reportType = findItem(urp?.report_type_id ?? null);
      const reportDate = formatReportPeriodIso(
        urp?.report_date ?? null,
        reportType?.name,
      );
      const gender =
        genderNameById.get(l.gender_id) ?? "All";
      return {
        "Report Type": reportType?.name,
        "Report Period": reportDate,
        "Utility ID": urp?.utility_id,
        Division: "Employees",
        Gender: gender,
        "Number of Employees": resolveEntryValue(
          l,
          dataTypeNameById.get(employeesId) ?? null,
          itemsById,
        ),
      };
    }),
  );
}
