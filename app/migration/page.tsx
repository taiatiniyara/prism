import { connection } from "next/server";
import { getCurrentUser } from "@/lib/user.service";

import MigrationButtons from "./buttons";
import DataEntryComparisonPanel from "./data-entry-comparison-panel";
import { getDataEntryComparisonFilterOptions } from "./service";

export default async function MigrationPage() {
  await connection();
  const user = await getCurrentUser();

  if (user.role !== "DEV") {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Unauthorized: DEV role required.
      </div>
    );
  }

  const comparisonOptions = await getDataEntryComparisonFilterOptions();

  return (
    <div>
      <MigrationButtons />
      <DataEntryComparisonPanel options={comparisonOptions} />
    </div>
  );
}
