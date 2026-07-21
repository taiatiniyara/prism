import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  dlValue,
  formatReportPeriodIso,
  resolveDlIds,
} from "@/lib/legacy/legacy-dl-resolver";

const FxRateTrainingId = 4213040060;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const idMap = await resolveDlIds([FxRateTrainingId]);
  const prismId = idMap.get(FxRateTrainingId);

  const entries = prismId
    ? await db
        .select()
        .from(dataEntries)
        .where(eq(dataEntries.measure_def_id, prismId))
    : [];

  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));
  const allUtils = await db
    .select()
    .from(organisations)
    .where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const rpMap = new Map(rps.map((r) => [r.id, r]));
  const uMap = new Map(allUtils.map((u) => [u.id, u]));

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    entries.map((l) => {
      const rp = rpMap.get(l.report_period_id);
      const u = rp ? uMap.get(rp.utility_id) : undefined;
      const reportType = findItem(rp?.report_type_id ?? null)?.name;
      return {
        Date: formatReportPeriodIso(rp?.report_date ?? null, reportType),
        CurrencyCode: u ? findItem(u.country_id)?.name : undefined,
        "Local to USD Conversion Rate": dlValue(l.value),
      };
    }),
  );
}
