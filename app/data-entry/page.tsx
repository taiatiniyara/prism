import { getCurrentUser } from "@/lib/user.service";
import { GetReportPeriods } from "./service";
import ReportPeriodTable from "./reportPeriodTable";

export default async function DataEntryHomePage() {
  const user = await getCurrentUser();
  const reportPeriods = await GetReportPeriods(user);
  return (
    <ReportPeriodTable
      role={user.role}
      list={reportPeriods}
    />
  );
}
