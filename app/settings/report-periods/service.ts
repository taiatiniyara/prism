"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { managedListItems } from "@/db/schema/managedLists";
import {
  NewReportPeriod,
  reportPeriods,
  ReportPeriod,
} from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function AllReportPeriods() {
  const query = db
    .select()
    .from(reportPeriods)
    .orderBy(reportPeriods.report_date)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .leftJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    );
  const list = await query;
  return list.map((item) => ({
    ...item.report_periods,
    utility: item.organisations?.acronym ?? item.organisations?.name,
    report_type: item.managed_list_items?.name,
  }));
}

export async function CreateReportPeriod(
  data: NewReportPeriod,
): Promise<DataTableFormResponse<ReportPeriod>> {
  const [rp] = await db.insert(reportPeriods).values(data).returning();
  revalidatePath("/settings/report-periods");
  return {
    success: true,
    message: "Report period created successfully",
    data: rp,
  };
}

export async function UpdateReportPeriod(
  data: Partial<ReportPeriod>,
): Promise<DataTableFormResponse<ReportPeriod>> {
  const [upd] = await db
    .update(reportPeriods)
    .set(data)
    .where(eq(reportPeriods.id, data.id!))
    .returning();
  revalidatePath("/settings/report-periods");
  return {
    success: true,
    message: "Report period updated successfully",
    data: upd,
  };
}

export async function DeleteReportPeriod(
  id: number,
): Promise<DataTableFormResponse<ReportPeriod>> {
  await db.delete(reportPeriods).where(eq(reportPeriods.id, id));
  revalidatePath("/settings/report-periods");
  return {
    success: true,
    message: "Report period deleted successfully",
  };
}
