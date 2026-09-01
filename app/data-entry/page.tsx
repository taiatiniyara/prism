import { getCurrentUser } from "@/lib/user.service";
import { GetReportPeriods } from "./service";
import ReportPeriodTable from "./reportPeriodTable";

export default async function DataEntryHomePage() {
  const user = await getCurrentUser();
  const reportPeriods = await GetReportPeriods(user);
  return (
    <div className="space-y-2">
      <ReportPeriodTable
        role={user.role}
        list={reportPeriods}
      />
    </div>
  );
}
