import { getCurrentUser } from "@/lib/user.service";
import { GetReportPeriods } from "./service";
import ReportPeriodTable from "./reportPeriodTable";
import Link from "next/link";

export default async function DataEntryHomePage() {
  const user = await getCurrentUser();
  const reportPeriods = await GetReportPeriods(user);
  return (
    <div className="space-y-2">
      <Link
        href="/data-entry/balanced-scorecard"
        className="inline-flex rounded border px-3 py-1 text-sm hover:bg-muted"
      >
        Open Balanced Scorecard
      </Link>
      <ReportPeriodTable
        role={user.role}
        list={reportPeriods}
      />
    </div>
  );
}
