import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

const SAFETY_MEASURE_NAMES = [
  "Hours lost to Work Related Injuries",
  "Hours Worked Actual",
  "Number of Work Related Injuries",
] as const;

// Power BI column labels for measures whose catalogue name drifted from the
// legacy semantic-model name. Keyed by measure name.
const SAFETY_COLUMN_LABELS: Record<string, string> = {
  "Hours lost to Work Related Injuries": "Hours Lost to Work Related Injuries",
  "Hours Worked Actual": "Total Hours Worked",
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...SAFETY_MEASURE_NAMES]));

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
    .where(publishedPeriodCondition);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    prismIds,
  );

  // Hours Worked measures are stored per utility-function slice; "Total Hours
  // Worked" is the function-wide row. Resolve the All member so slice rows
  // don't shadow the total when picking.
  const ufListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Utility Function"))
      .limit(1)
  )[0]?.id;
  const ufAllId = ufListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, ufListId),
              eq(managedListItems.name, "All"),
            ),
          )
          .limit(1)
      )[0]?.id
    : undefined;

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps
      .filter((urp) => entries.some((d) => d.report_period_id === urp.id))
      .map((urp) => {
        const dlValues = measureDefs.reduce(
          (acc, d) => {
            const base = (v: typeof entries[number]) =>
              v.measure_def_id === d.id && v.report_period_id === urp.id;
            const val =
              entries.find(
                (v) =>
                  base(v) &&
                  (ufAllId == null || v.utility_function_id === ufAllId),
              ) ?? entries.find(base);
            let value = resolveEntryValue(
              val,
              dataTypeNameById.get(d.id) ?? null,
              itemsById,
            );
            // "Total" measures: when the function-wide row is absent for this
            // period but per-function slices carry values, sum the slices.
            if (value == null && ufAllId != null) {
              let sum = 0;
              let any = false;
              for (const v of entries.filter(base)) {
                if (v.utility_function_id === ufAllId) continue;
                const n = resolveEntryValue(
                  v,
                  dataTypeNameById.get(d.id) ?? null,
                  itemsById,
                );
                if (typeof n === "number") {
                  sum += n;
                  any = true;
                }
              }
              if (any) value = sum;
            }
            const label = SAFETY_COLUMN_LABELS[d.name] ?? d.name;
            return {
              [label]: value,
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
          ...dlValues,
        };
      }),
  );
}
