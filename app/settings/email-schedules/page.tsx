import DataTable from "@/components/tables/data-table";
import { EmailSchedule } from "@/db/schema/email-schedules";
import {
  AllEmailSchedules,
  CreateEmailSchedule,
  UpdateEmailSchedule,
} from "./service";
import { AllOrganisations } from "../organisations/orgs.service";
import SendNowButton from "./send-now-button";
import SendHistoryPanel from "./send-history-panel";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

export default async function EmailSchedulesPage() {
  const list = await AllEmailSchedules();
  const utilities = await AllOrganisations({ all: true });

  const utilityOptions = [
    { value: "", label: "All Utilities" },
    ...utilities.map((org) => ({
      value: org.id,
      label: org.acronym ?? org.name,
    })),
  ];

  return (
    <div className="space-y-4">
      <DataTable<EmailSchedule>
        columns={[
          "name",
          "recipient_role",
          "frequency",
          "utility_name",
          "starts_at",
          "ends_at",
          "is_active",
          "last_sent_at",
        ]}
        data={list}
        title="Email Schedules"
        createFormProps={{
          formAction: CreateEmailSchedule,
          fields: [
            { key: "name", type: "text" },
            {
              key: "recipient_role",
              type: "select",
              selectList: [
                { value: "BLO", label: "BLO" },
                { value: "CEO", label: "CEO" },
              ],
            },
            {
              key: "frequency",
              type: "select",
              selectList: FREQUENCIES,
            },
            {
              key: "day_of_week",
              type: "select",
              selectList: DAYS_OF_WEEK,
            },
            {
              key: "day_of_month",
              type: "select",
              selectList: DAYS_OF_MONTH,
            },
            { key: "starts_at", type: "date" },
            { key: "ends_at", type: "date" },
            {
              key: "utility_id",
              type: "select",
              selectList: utilityOptions,
            },
            { key: "is_active", type: "checkbox" },
          ],
        }}
        updateFormProps={{
          formAction: UpdateEmailSchedule,
          fields: [
            { key: "name", type: "text" },
            {
              key: "recipient_role",
              type: "select",
              selectList: [
                { value: "BLO", label: "BLO" },
                { value: "CEO", label: "CEO" },
              ],
            },
            {
              key: "frequency",
              type: "select",
              selectList: FREQUENCIES,
            },
            {
              key: "day_of_week",
              type: "select",
              selectList: DAYS_OF_WEEK,
            },
            {
              key: "day_of_month",
              type: "select",
              selectList: DAYS_OF_MONTH,
            },
            { key: "starts_at", type: "date" },
            { key: "ends_at", type: "date" },
            {
              key: "utility_id",
              type: "select",
              selectList: utilityOptions,
            },
            { key: "is_active", type: "checkbox" },
          ],
        }}
      />
      {list.length > 0 && (
        <>
          <div className="px-5 pb-2">
            <h3 className="text-sm font-semibold mb-3">Send Now</h3>
            <div className="flex flex-wrap gap-2">
              {list.map((schedule) => (
                <SendNowButton
                  key={schedule.id}
                  scheduleId={schedule.id}
                  scheduleName={schedule.name}
                />
              ))}
            </div>
          </div>
          <SendHistoryPanel schedules={list} />
        </>
      )}
    </div>
  );
}
