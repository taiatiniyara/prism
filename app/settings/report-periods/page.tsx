import DataTable from "@/components/tables/data-table";
import { AllOrganisations } from "../organisations/orgs.service";
import {
  AllReportPeriods,
  CreateReportPeriod,
  UpdateReportPeriod,
} from "./service";
import { ReportPeriod } from "@/db/schema/reportPeriods";
import { db } from "@/db/connection";
import { managedListItems } from "@/db/schema/managedLists";
import { eq } from "drizzle-orm";

async function getReportTypeOptions() {
  const items = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true))
    .orderBy(managedListItems.name);
  return items.map((item) => ({
    value: item.id,
    label: item.name,
  }));
}

export default async function ReportPeriodsPage() {
  const list = await AllReportPeriods();
  const utilities = await AllOrganisations({ all: true });
  const reportTypes = await getReportTypeOptions();

  return (
    <DataTable<ReportPeriod>
      columns={["utility", "report_type", "report_date", "request_date"]}
      data={list}
      title="Report Periods"
      createFormProps={{
        formAction: CreateReportPeriod,
        fields: [
          {
            key: "utility_id",
            type: "select",
            selectList: utilities.map((org) => ({
              value: org.id,
              label: org.acronym ?? org.name,
            })),
          },
          {
            key: "report_type_id",
            type: "select",
            selectList: reportTypes,
          },
          { key: "report_date", type: "date" },
          { key: "request_date", type: "date" },
        ],
      }}
      updateFormProps={{
        formAction: UpdateReportPeriod,
        fields: [
          {
            key: "utility_id",
            type: "select",
            selectList: utilities.map((org) => ({
              value: org.id,
              label: org.acronym ?? org.name,
            })),
          },
          {
            key: "report_type_id",
            type: "select",
            selectList: reportTypes,
          },
          { key: "report_date", type: "date" },
          { key: "request_date", type: "date" },
        ],
      }}
    />
  );
}
