import { powerBiDetails } from "@/lib/powerbi";
import PowerBiDashboard from "./pbi";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/user.service";

async function getCredentials(): Promise<Awaited<ReturnType<typeof powerBiDetails>> | { error: string }> {
  try {
    const user = await getCurrentUser().catch(() => null);
    return await powerBiDetails(user ? { email: user.email, role: user.role, org_id: user.org_id } : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dashboard] powerBiDetails failed:", message);
    return { error: message };
  }
}

export default async function DashboardPage() {
  await headers(); // opt into dynamic rendering (powerbi.service uses Date.now() for token cache)
  const credentials = await getCredentials();

  if ("error" in credentials) {
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
