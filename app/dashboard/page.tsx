import { powerBiDetails } from "@/lib/powerbi.service";
import PowerBiDashboard from "./pbi";
import { headers } from "next/headers";

async function getCredentials(): Promise<{ token: string; embedUrl: string; reportId: string } | { error: string }> {
  try {
    return await powerBiDetails();
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
        <p className="text-muted-foreground mt-4 max-w-md text-xs font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded">
          Error: {credentials.error}
        </p>
        <p className="text-muted-foreground mt-2 max-w-md text-xs font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded">
          EMBED_URL env: &quot;{process.env.POWERBI_EMBED_URL?.substring(0, 80)}...&quot;
          (len={process.env.POWERBI_EMBED_URL?.length ?? 0})
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
