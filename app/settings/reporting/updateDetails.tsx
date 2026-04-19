"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FaSave } from "react-icons/fa";
import { UpdateOrganisation } from "../organisations/orgs.service";
import { toast } from "sonner";
import SubmitBtn from "@/components/submitBtn";
import { Switch } from "@/components/ui/switch";
import SettingsSection from "@/components/settings/settings-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTH_OPTIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function getInitialFinancialYearEnd(value: string | null) {
  if (!value) {
    return { day: "", month: undefined as string | undefined };
  }

  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!match) {
    return { day: "", month: undefined as string | undefined };
  }

  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { day: "", month: undefined as string | undefined };
  }

  const normalizedMonth = match[2].slice(0, 3);
  const month =
    MONTH_OPTIONS.find(
      (m) => m.toLowerCase() === normalizedMonth.toLowerCase(),
    ) ?? undefined;

  return {
    day: String(day),
    month,
  };
}

export default function UpdateReportingDetailsForm(props: {
  financial_year_end: string | null;
  is_mth_report_relevant: boolean;
  orgId: number;
}) {
  const initialFinancialYearEnd = getInitialFinancialYearEnd(
    props.financial_year_end,
  );

  return (
    <div className="space-y-12">
      <SettingsSection
        title="Financial Year End"
        description="Set the financial year end month for your organisation. This will be used to determine the financial year for reporting purposes."
      >
        <form
          action={async (formData) => {
            const financialYearEndDay = Number(
              formData.get("financial_year_end_day") as string,
            );
            const financialYearEndMonth = formData.get(
              "financial_year_end_month",
            ) as string;

            if (
              !Number.isInteger(financialYearEndDay) ||
              financialYearEndDay < 1 ||
              financialYearEndDay > 31
            ) {
              toast.error("Financial year end day must be between 1 and 31");
              return;
            }

            if (
              !MONTH_OPTIONS.includes(
                financialYearEndMonth as (typeof MONTH_OPTIONS)[number],
              )
            ) {
              toast.error(
                "Financial year end month must be between Jan and Dec",
              );
              return;
            }

            const financial_year_end = `${financialYearEndDay} ${financialYearEndMonth}`;

            const res = await UpdateOrganisation({
              financial_year_end,
              id: props.orgId,
            });
            if (res.success) {
              toast.success(res.message);
            } else {
              toast.error(res.message);
            }
          }}
          className="flex items-center space-x-3 w-fit"
        >
          <Input
            className="w-24"
            required
            type="number"
            min={1}
            max={31}
            step={1}
            name="financial_year_end_day"
            defaultValue={initialFinancialYearEnd.day}
            placeholder="Day"
          />

          <Select
            name="financial_year_end_month"
            required
            defaultValue={initialFinancialYearEnd.month}
          >
            <SelectTrigger className="w-32 shadow">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((month) => (
                <SelectItem
                  key={month}
                  value={month}
                >
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SubmitBtn
            text={
              <>
                <FaSave /> Save
              </>
            }
          />
        </form>
      </SettingsSection>
      <SettingsSection
        title="Monthly Reporting"
        description="Specify whether your organisation prepares monthly reports."
      >
        <div className="flex items-center space-x-8 border w-fit p-4.5 rounded-lg shadow-md">
          <Label htmlFor="monthly-reporting">Submit Monthly Reports</Label>

          <Switch
            id="monthly-reporting"
            defaultChecked={props.is_mth_report_relevant}
            onCheckedChange={async (checked) => {
              const res = await UpdateOrganisation({
                is_mth_reports_relevant_month: Boolean(checked),
                id: props.orgId,
              });
              if (res.success) {
                toast.success(res.message);
              } else {
                toast.error(res.message);
              }
            }}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
