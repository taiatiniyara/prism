import { getCurrentUser } from "@/services/user.service";
import { GetReportPeriods } from "./service";

export default async function DataEntryHomePage() {
  const user = await getCurrentUser();
  const reportPeriods = await GetReportPeriods(user);
  console.log(reportPeriods);
  return <div>DataEntryHomePage</div>;
}
