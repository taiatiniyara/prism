"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { CurrentUser } from "@/lib/user.service";
import { desc, eq } from "drizzle-orm";

export interface ReportPeriodDTO {
  Period: string;
  Utility: string;
  Report_Type: string;
  Pending_With: string;
  Updated: string;
}

export async function GetReportPeriods(
  user: CurrentUser,
): Promise<ReportPeriodDTO[]> {
  const ml = await db.select().from(managedListItems);
  const rolesList = await db.select().from(roles);
  const rp = db
    .select()
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .orderBy(desc(reportPeriods.report_date));
  if (user.role !== "DEV" && user.role !== "BMO") {
    rp.where(eq(reportPeriods.utility_id, user.org_id!));
  }
  const list = await rp;
  return list.map((item) => {
    return {
      Period: item.report_periods.report_date.toISOString().split("T")[0],
      Utility: item.organisations?.acronym || "",
      Report_Type:
        ml.find((x) => x.id === item.report_periods.report_type_id)?.name || "",
      Pending_With:
        rolesList.find((x) => x.id === item.report_periods.who_id)?.name || "",
      Updated: item.report_periods.updated_at.toISOString().split("T")[0],
    };
  });
}
