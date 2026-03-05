import { powerBiDetails } from "@/lib/powerbi.service";
import PowerBiDashboard from "./pbi";

export default async function DashboardPage() {
  const credentials = await powerBiDetails();
  return (
    <PowerBiDashboard
      token={credentials.token}
      embedUrl={credentials.embedUrl}
      reportId={credentials.reportId}
    />
  );
}
