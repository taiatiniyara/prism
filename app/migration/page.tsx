import { connection } from "next/server";
import { getCurrentUser } from "@/lib/user.service";

import MigrationButtons from "./buttons";
import DataEntryBreakdownPanel from "./data-entry-breakdown-panel";
import DataEntryComparisonPanel from "./data-entry-comparison-panel";
import { getDataEntryBreakdownFilterOptions, getDataEntryComparisonFilterOptions } from "./service";

export default async function MigrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const user = await getCurrentUser();

  if (user.role !== "DEV") {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Unauthorized: DEV role required.
      </div>
    );
  }

  const [comparisonOptions, breakdownOptions] = await Promise.all([
    getDataEntryComparisonFilterOptions(),
    getDataEntryBreakdownFilterOptions(),
  ]);

  const params = await searchParams;

  return (
    <div>
      <MigrationButtons />
      <DataEntryBreakdownPanel
        options={breakdownOptions}
        initialUtility={params.utility as string | undefined}
        initialReportPeriod={params.reportPeriod as string | undefined}
        initialCategory={params.category as string | undefined}
        initialSubcategory={params.subcategory as string | undefined}
      />
      <DataEntryComparisonPanel options={comparisonOptions} />
    </div>
  );
}
