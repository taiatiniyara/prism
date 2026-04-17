"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FaSave } from "react-icons/fa";
import { UpdateOrganisation } from "../organisations/orgs.service";
import { toast } from "sonner";
import SubmitBtn from "@/components/submitBtn";
import { Switch } from "@/components/ui/switch";
import SettingsSection from "@/components/settings/settings-section";

export default function UpdateReportingDetailsForm(props: {
  financial_year_end: string | null;
  is_mth_report_relevant: boolean;
  orgId: number;
}) {
  return (
    <div className="space-y-12">
      <SettingsSection
        title="Financial Year End"
        description="Set the financial year end month for your organisation. This will be used to determine the financial year for reporting purposes."
      >
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
              toast.success(res.message);
            } else {
              toast.error(res.message);
            }
          }}
          className="flex items-center space-x-3 w-fit"
        >
          <Input
            className="p-3.5"
            required
            name="financial_year_end"
            defaultValue={props.financial_year_end || undefined}
            placeholder="E.g. 30 December"
          />
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
