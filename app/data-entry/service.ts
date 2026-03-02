"use server";

import { db } from "@/db/connection";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { CurrentUser } from "@/services/user.service";
import { eq } from "drizzle-orm";

export async function GetReportPeriods(user: CurrentUser) {
  const ml = await db.select().from(managedListItems);
  const rp = db
    .select()
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id));
  if (user.role !== "DEV" && user.role !== "BMO") {
    rp.where(eq(reportPeriods.utility_id, user.org_id!));
  }
  const list = await rp;
  return list.map((item) => {
    return {
      ...item.report_periods,
      utility: item.organisations?.name,
      report_type: ml.find((x) => x.id === item.report_periods.report_type_id)
        ?.name,
      status: ml.find((x) => x.id === item.report_periods.status_id)?.name,
      who: ml.find((x) => x.id === item.report_periods.who_id)?.name,
    };
  });
}
