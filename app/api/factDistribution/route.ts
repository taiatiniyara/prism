import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { serviceAreas } from "@/db/schema/utility";
import {
  reportPeriods,
  publishedPeriodCondition,
} from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray, not, ilike } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

// The distribution feed mirrors prism-training's /api/factDistribution, which
// selects the service-area-level (non-aggregated, agg-level 3) measures in the
// Distribution subcategory (dl_subcategory_id 270) and emits each data label's
// name as the column. prism's measure defs live under finer physical subgroups
// (Transformers/Network/Downtime/Consumption) rather than a "Distribution"
// subgroup, so the set is pinned here as measure name -> the p1 data-label
// column it maps to. Keep in sync with p1's subcategory-270 data labels.
const DISTRIBUTION_MEASURE_LABELS: Record<string, string> = {
  "Customers Served": "Electricity Customers",
  "Electricity Sold to Customers": "Electricity Sold to Customers",
  "Distribution Transformer Average Load":
    "Distribution Network Average Transformer Load",
  "Distribution Transformer Rated Capacity":
    "Distribution Network Transformer Capacity",
  "Network Length": "Distribution Network Length",
  "Network Planned Downtime Events":
    "Distribution Network Planned Downtime Events",
  "Network Planned Downtime Hours": "Distribution Network Planned Downtime",
  "Network Unplanned Downtime Events":
    "Distribution Network Unplanned Downtime Events",
  "Network Unplanned Downtime Hours": "Distribution Network Unplanned Downtime",
  "Station Auxilliary Usage":
    "Electricity Consumed Internally (Station Auxilliaries)",
};

// Emission order mirrors prism-training's /api/factDistribution Data columns,
// which reverse the p1 data-label iteration order (and append the generation
// ECI column, which prism has no source for and emits as null).
const DISTRIBUTION_COLUMN_ORDER = [
  "Electricity Consumed Internally (Station Auxilliaries)",
  "Distribution Network Unplanned Downtime",
  "Distribution Network Unplanned Downtime Events",
  "Distribution Network Planned Downtime",
  "Distribution Network Planned Downtime Events",
  "Distribution Network Average Transformer Load",
  "Distribution Network Transformer Capacity",
  "Distribution Network Length",
  "Electricity Sold to Customers",
  "Electricity Customers",
  "GEN Electricity Consumed Internally",
];

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      inArray(measureDefinitions.name, [
        ...Object.keys(DISTRIBUTION_MEASURE_LABELS),
      ]),
    );

  const allDlIds = measureDefs.map((m) => m.id);
  if (allDlIds.length === 0) return Response.json([]); // Distribution measures are scoped by the Distribution utility function.
  const distributionListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Utility Function"))
      .limit(1)
  )[0]?.id;
  const distributionFunctionId = distributionListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, distributionListId),
              eq(managedListItems.name, "Distribution"),
            ),
          )
          .limit(1)
      )[0]?.id
    : undefined;

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, allDlIds),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allSa = await db
    .select()
    .from(serviceAreas)
    .where(not(ilike(serviceAreas.name, "%Utility Tier%")));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } =
    await getValueResolutionContext(allDlIds);

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  function findEntryValue(
    measureId: number,
    urpId: number,
    saId: number,
    functionId?: number,
  ) {
    const entry = entries.find(
      (l) =>
        l.measure_def_id === measureId &&
        l.report_period_id === urpId &&
        l.service_area_id === saId &&
        (functionId == null || l.utility_function_id === functionId),
    );
    return resolveEntryValue(
      entry,
      dataTypeNameById.get(measureId) ?? null,
      itemsById,
    );
  }

  return Response.json(
    rps
      .filter((urp) => entries.some((d) => d.report_period_id === urp.id))
      .map((urp) => {
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          ReportType: reportType,
          ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
          ReportPeriodId: urp.id,
          UtilityId: urp.utility_id,
          Data: allSa
            .filter((sa) => sa.utility_id === urp.utility_id)
            .map((sa) => {
              const values: Record<string, unknown> = {};
              for (const dl of measureDefs) {
                const label = DISTRIBUTION_MEASURE_LABELS[dl.name] ?? dl.name;
                if (label in values) continue;
                values[label] = findEntryValue(
                  dl.id,
                  urp.id,
                  sa.id,
                  distributionFunctionId,
                );
              }
              const row: Record<string, unknown> = { ServiceAreaId: sa.id };
              for (const col of DISTRIBUTION_COLUMN_ORDER) {
                row[col] =
                  col in values ? values[col] : null;
              }
              return row;
            }),
        };
      }),
  );
}