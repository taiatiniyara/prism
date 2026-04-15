import { getSession } from "@/lib/session.service";
import { GetOrganisationById } from "../organisations/orgs.service";
import UpdateReportingDetailsForm from "./updateDetails";

export default async function ReportingSettingsPage() {
  const session = await getSession();
  const orgId = session?.user.organisation_id;
  if (!orgId) {
    return <div className="p-4">Organisation context is unavailable.</div>;
  }

  const org = await GetOrganisationById(orgId);
  return (
    <div className="p-4">
      <UpdateReportingDetailsForm
        orgId={org?.id ?? orgId}
        financial_year_end={org?.financial_year_end}
        is_mth_report_relevant={org?.is_mth_reports_relevant_month}
      />
    </div>
  );
}
