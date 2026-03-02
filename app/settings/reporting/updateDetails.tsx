"use client";

import { Heading } from "@/components/heading";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { FaSave } from "react-icons/fa";
import { UpdateOrganisation } from "../organisations/orgs.service";
import { toast } from "sonner";
import SubmitBtn from "@/components/submitBtn";

export default function UpdateReportingDetailsForm(props: {
  financial_year_end: string | null;
  is_mth_report_relevant: boolean;
  orgId: number;
}) {
  const [save, setSave] = useState(false);
  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <Heading level={4}>Financial Year End</Heading>
        <p className="text-muted-foreground w-1/2 mt-2">
          Set the financial year end month for your organisation. This will be
          used to determine the financial year for reporting purposes.
        </p>

        <form
          action={async (formData) => {
            const financial_year_end = formData.get(
              "financial_year_end",
            ) as string;
            if (!financial_year_end) {
              toast.error("Financial year end is required");
              return;
            }
            const res = await UpdateOrganisation({
              financial_year_end,
              id: props.orgId,
            });
            if (res.success) {
              setSave(false);
              toast.success(res.message);
            } else {
              toast.error(res.message);
            }
          }}
          className="flex items-center space-x-3 w-fit"
        >
          <Input
            onChange={() => {
              setSave(true);
            }}
            className="p-3.5"
            required
            name="financial_year_end"
            defaultValue={props.financial_year_end || undefined}
            placeholder="E.g. 30 December"
          />
          {save && (
            <SubmitBtn
              text={
                <>
                  <FaSave /> Save
                </>
              }
            />
          )}
        </form>
      </div>
      <div className="space-y-3">
        <Heading level={4}>Monthly Reporting</Heading>
        <p className="text-muted-foreground w-1/2 mt-2">
          Specify whether your organisation prepares monthly reports.
        </p>

        <div className="flex items-center space-x-2 border w-fit p-4.5 rounded-lg shadow-md">
          <Checkbox
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
          <Label htmlFor="monthly-reporting">Submit Monthly Reports?</Label>
        </div>
      </div>
    </div>
  );
}
