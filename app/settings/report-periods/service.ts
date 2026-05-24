"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  generationRelevance,
  generationToggleRelevance,
} from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import {
  NewReportPeriod,
  reportPeriods,
  ReportPeriod,
} from "@/db/schema/reportPeriods";
import { energyResources, organisations } from "@/db/schema/utility";
import { and, desc, eq, lt } from "drizzle-orm";
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

  const [prevRp] = await db
    .select()
    .from(reportPeriods)
    .where(
      and(
        eq(reportPeriods.utility_id, rp.utility_id),
        lt(reportPeriods.report_date, rp.report_date),
      ),
    )
    .orderBy(desc(reportPeriods.report_date))
    .limit(1);

  if (prevRp) {
    const energyResourcesList = await db
      .select()
      .from(energyResources)
      .where(eq(energyResources.utility_id, rp.utility_id));

    for (const resource of energyResourcesList) {
      const prevEntry = resource.period_entries.find(
        (pe) => pe.report_period_id === prevRp.id,
      );
      if (!prevEntry) continue;

      const hasNewEntry = resource.period_entries.some(
        (pe) => pe.report_period_id === rp.id,
      );
      if (hasNewEntry) continue;

      const newPeriodEntries = [
        ...resource.period_entries,
        {
          report_period_id: rp.id,
          capacity_mw: prevEntry.capacity_mw,
          is_active: prevEntry.is_active,
        },
      ];

      await db
        .update(energyResources)
        .set({ period_entries: newPeriodEntries })
        .where(eq(energyResources.id, resource.id));
    }

    const prevGenRelevance = await db
      .select()
      .from(generationRelevance)
      .where(eq(generationRelevance.report_period_id, prevRp.id));

    if (prevGenRelevance.length > 0) {
      const newGenRelevance = prevGenRelevance.map((gr) => ({
        id: crypto.randomUUID(),
        report_period_id: rp.id,
        service_area_id: gr.service_area_id,
        input_def_id: gr.input_def_id,
        energy_provider_id: gr.energy_provider_id,
        energy_source_id: gr.energy_source_id,
        energy_resource_type_id: gr.energy_resource_type_id,
        is_relevant: gr.is_relevant,
        is_deleted: gr.is_deleted,
        updatedAt: new Date(),
        updatedById: gr.updatedById,
      }));

      await db.insert(generationRelevance).values(newGenRelevance);
    }

    const prevGenToggleRelevance = await db
      .select()
      .from(generationToggleRelevance)
      .where(eq(generationToggleRelevance.report_period_id, prevRp.id));

    if (prevGenToggleRelevance.length > 0) {
      const newGenToggleRelevance = prevGenToggleRelevance.map((gtr) => ({
        id: crypto.randomUUID(),
        report_period_id: rp.id,
        service_area_id: gtr.service_area_id,
        energy_provider_id: gtr.energy_provider_id,
        energy_source_id: gtr.energy_source_id,
        is_relevant: gtr.is_relevant,
        is_deleted: gtr.is_deleted,
        updatedAt: new Date(),
        updatedById: gtr.updatedById,
      }));

      await db.insert(generationToggleRelevance).values(newGenToggleRelevance);
    }
  }

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
