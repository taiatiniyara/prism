import ScorecardPageClient from "./page.client";
import { getCurrentUser } from "@/lib/user.service";

export default async function BalancedScorecardPage() {
  let orgId: number | null = null;
  let error: boolean = false;
  try {
    const user = await getCurrentUser();
    orgId = user.org_id ?? null;
  } catch {
    error = true;
  }

  if (error) {
    return (
      <div className="space-y-3 p-2 sm:p-3">
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Unable to load scorecard data. Please try again later.
        </div>
      </div>
    );
  }

  return <ScorecardPageClient scopedUtilityId={orgId} />;
}
