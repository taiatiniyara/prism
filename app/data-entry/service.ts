"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import { dataEntries, DataEntryStatusId } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { CurrentUser } from "@/lib/user.service";
import { desc, eq } from "drizzle-orm";

export interface ReportPeriodDTO {
  Id: number;
  Period: string;
  Utility: string;
  Report_Type: string;
  Requested: number;
  Pending: number;
  Entered: number;
  Reviewed: number;
  Approved: number;
  Live: number;
  Pending_With: string;
  Updated: string;
}

export async function GetReportPeriods(
  user: CurrentUser,
): Promise<ReportPeriodDTO[]> {
  const ml = await db.select().from(managedListItems);
  const rolesList = await db.select().from(roles);
  const de = db.select().from(dataEntries);
  const rp = db
    .select()
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .orderBy(desc(reportPeriods.report_date));
  if (user.role !== "DEV" && user.role !== "BMO") {
    rp.where(eq(reportPeriods.utility_id, user.org_id!));
  }
  let deList = await de;
  const list = await rp;
  return list.map((item) => {
    deList = deList.filter(
      (x) => x.report_period_id === item.report_periods.id,
    );
    return {
      Id: item.report_periods.id,
      Period: item.report_periods.report_date.toISOString().split("T")[0],
      Utility: item.organisations?.acronym || "",
      Report_Type:
        ml.find((x) => x.id === item.report_periods.report_type_id)?.name || "",
      Pending_With:
        rolesList.find((x) => x.id === item.report_periods.who_id)?.name || "",
      Updated: item.report_periods.updated_at.toISOString().split("T")[0],
      Requested: deList.filter(
        (x) => x.status_id === DataEntryStatusId.Requested,
      ).length,
      Pending: deList.filter((x) => x.status_id === DataEntryStatusId.Pending)
        .length,
      Entered: deList.filter((x) => x.status_id === DataEntryStatusId.Entered)
        .length,
      Reviewed: deList.filter((x) => x.status_id === DataEntryStatusId.Reviewed)
        .length,
      Approved: deList.filter((x) => x.status_id === DataEntryStatusId.Approved)
        .length,
      Live: deList.filter((x) => x.status_id === DataEntryStatusId.Live).length,
    };
  });
}
