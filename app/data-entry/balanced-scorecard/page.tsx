import ScorecardPageClient from "./page.client";
import { getCurrentUser } from "@/lib/user.service";

export default async function BalancedScorecardPage() {
  try {
    const user = await getCurrentUser();
    return <ScorecardPageClient scopedUtilityId={user.org_id ?? null} />;
  } catch {
    return (
      <div className="space-y-3 p-2 sm:p-3">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Unable to load scorecard data. Please try again later.
        </div>
      </div>
    );
  }
}
