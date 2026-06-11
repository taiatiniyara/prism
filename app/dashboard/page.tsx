import { powerBiDetails } from "@/lib/powerbi.service";
import PowerBiDashboard from "./pbi";

async function getCredentials() {
  try {
    return await powerBiDetails();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const credentials = await getCredentials();

  if (!credentials) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
          Dashboard unavailable
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          Unable to load the Power BI dashboard. Please try again later or contact support if the issue persists.
        </p>
      </div>
    );
  }

  return (
    <PowerBiDashboard
      token={credentials.token}
      embedUrl={credentials.embedUrl}
      reportId={credentials.reportId}
    />
  );
}
