"use client";

import { FormEvent, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FaSave } from "react-icons/fa";
import { UpdateOrganisation } from "../organisations/orgs.service";
import { toast } from "sonner";
import SubmitBtn from "@/components/submitBtn";
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

type MonthOption = (typeof MONTH_OPTIONS)[number];

function getMaxDayForMonth(month: MonthOption): number {
  switch (month) {
    case "Feb":
      return 28;
    case "Apr":
    case "Jun":
    case "Sep":
    case "Nov":
      return 30;
    case "Jan":
    case "Mar":
    case "May":
    case "Jul":
    case "Aug":
    case "Oct":
    case "Dec":
      return 31;
  }
}

function getInitialFinancialYearEnd(
  fyeMonth: number | null,
  fyeDay: number | null,
) {
  const month =
    fyeMonth != null && fyeMonth >= 1 && fyeMonth <= 12
      ? MONTH_OPTIONS[fyeMonth - 1]
      : undefined;
  if (!month || fyeDay == null) {
    return { day: "", month: undefined as MonthOption | undefined };
  }
  const maxDayForMonth = getMaxDayForMonth(month);
  if (!Number.isInteger(fyeDay) || fyeDay < 1 || fyeDay > maxDayForMonth) {
    return { day: "", month };
  }
  return { day: String(fyeDay), month };
}

export default function UpdateReportingDetailsForm(props: {
  fye_month: number | null;
  fye_day: number | null;
  is_mth_report_relevant: boolean;
  orgId: number;
}) {
  const initialFinancialYearEnd = getInitialFinancialYearEnd(
    props.fye_month,
    props.fye_day,
  );
  const [financialYearEndMonth, setFinancialYearEndMonth] = useState<
    MonthOption | undefined
  >(initialFinancialYearEnd.month as MonthOption | undefined);
  const [financialYearEndDay, setFinancialYearEndDay] = useState<string>(
    initialFinancialYearEnd.day,
  );
  const maxFinancialYearEndDay = financialYearEndMonth
    ? getMaxDayForMonth(financialYearEndMonth)
    : undefined;

  const handleFinancialYearEndSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (
      !financialYearEndMonth ||
      !MONTH_OPTIONS.includes(financialYearEndMonth)
    ) {
      toast.error("Financial year end month must be between Jan and Dec");
      return;
    }

    const submittedFinancialYearEndDay = Number(financialYearEndDay);
    const maxDayForMonth = getMaxDayForMonth(financialYearEndMonth);

    if (
      !Number.isInteger(submittedFinancialYearEndDay) ||
      submittedFinancialYearEndDay < 1 ||
      submittedFinancialYearEndDay > (maxDayForMonth ?? 31)
    ) {
      toast.error(
        `Financial year end day must be between 1 and ${maxDayForMonth ?? 31} for ${financialYearEndMonth}`,
      );
      return;
    }

    const res = await UpdateOrganisation({
      fye_month: MONTH_OPTIONS.indexOf(financialYearEndMonth) + 1,
      fye_day: submittedFinancialYearEndDay,
      id: props.orgId,
    });

    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-12">
      <SettingsSection
        title="Financial Year End"
        description="Select the month and day that marks the end of your Utility's Financial Year."
      >
        <form
          onSubmit={(event) => {
            void handleFinancialYearEndSubmit(event);
          }}
          className="flex items-start space-x-3 w-fit"
        >
          <Select
            name="financial_year_end_month"
            required
            value={financialYearEndMonth}
            onValueChange={(value) => {
              const selectedMonth = value as MonthOption;
              setFinancialYearEndMonth(selectedMonth);

              const dayValue = Number(financialYearEndDay);
              const monthMaxDay = getMaxDayForMonth(selectedMonth);

              if (
                Number.isInteger(dayValue) &&
                monthMaxDay &&
                dayValue > monthMaxDay
              ) {
                setFinancialYearEndDay(String(monthMaxDay));
              }
            }}
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

          <div className="space-y-1">
            <Input
              className="w-24"
              required
              type="number"
              min={1}
              max={maxFinancialYearEndDay}
              step={1}
              name="financial_year_end_day"
              disabled={!financialYearEndMonth}
              value={financialYearEndDay}
              onChange={(event) => {
                const { value } = event.currentTarget;
                if (value === "") {
                  setFinancialYearEndDay("");
                  return;
                }

                const numericValue = Number(value);
                if (!Number.isInteger(numericValue)) {
                  return;
                }

                const currentMaxDay = maxFinancialYearEndDay ?? 31;

                if (numericValue < 1) {
                  setFinancialYearEndDay("1");
                  return;
                }

                if (numericValue > currentMaxDay) {
                  setFinancialYearEndDay(String(currentMaxDay));
                  return;
                }

                setFinancialYearEndDay(value);
              }}
              placeholder="Day"
            />
            <p className="text-xs text-muted-foreground px-1">
              Maximum days is: {maxFinancialYearEndDay ?? "Select month"}
            </p>
          </div>

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
        description="Select if your Utility would like to submit Monthly reports."
      >
        <div className="flex items-center gap-2 text-sm mt-2 py-4 border w-fit px-4 rounded-lg shadow hover:shadow-md">
          <Checkbox
            id="monthly-reporting"
            defaultChecked={props.is_mth_report_relevant}
            onCheckedChange={async (checked) => {
              const res = await UpdateOrganisation({
                is_mth_reports_relevant_month: checked === true,
                id: props.orgId,
              });
              if (res.success) {
                toast.success(res.message);
              } else {
                toast.error(res.message);
              }
            }}
          />
          <Label htmlFor="monthly-reporting">Will submit monthly reports</Label>
        </div>
      </SettingsSection>
    </div>
  );
}
