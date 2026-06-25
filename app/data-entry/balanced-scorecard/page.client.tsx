"use client";

import NewBscBuilder from "@/components/data-entry/new-bsc-builder";

// The Balanced Scorecard area now hosts only the BSC Builder. The legacy tabs
// (Strategy Builder, Strategy Map, Tree View, Strategy Tracker) and their
// machinery were removed.
export default function ScorecardPageClient({
  scopedUtilityId = null,
}: {
  scopedUtilityId?: number | null;
}) {
  return (
    <div className="space-y-2 p-1.5 sm:p-2">
      <NewBscBuilder key={scopedUtilityId ?? "global"} />
    </div>
  );
}
