import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  resolveDlIds,
  dlValue,
  formatReportPeriodIso,
} from "@/lib/legacy/legacy-dl-resolver";

const trainingIds = {
  HoursLostToWorkRelatedInjuries: 4213040181,
  TotalHoursWorked: 4213040180,
  NumberOfWorkRelatedInjuries: 4213040182,
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const idMap = await resolveDlIds(Object.values(trainingIds));
  const prismIds = Array.from(idMap.values()).filter(
    (id): id is number => id != null,
  );
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
        inArray(measureDefinitions.id, prismIds),
      ),
    );

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps
      .filter((urp) => entries.some((d) => d.report_period_id === urp.id))
      .map((urp) => {
        const dlValues = inputDefs.reduce(
          (acc, d) => {
            const val = entries.find(
              (v) => v.measure_def_id === d.id && v.report_period_id === urp.id,
            );
            return { [d.name]: dlValue(val?.value), ...acc };
          },
          {} as Record<string, unknown>,
        );
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          ReportType: reportType,
          ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
          UtilityId: urp.utility_id,
          ...dlValues,
        };
      }),
  );
}
