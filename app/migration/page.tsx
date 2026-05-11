import { connection } from "next/server";

import MigrationButtons from "./buttons";
import DataEntryMigrationPanel from "./data-entry-migration-panel";
import DataEntryComparisonPanel from "./data-entry-comparison-panel";
import { getDataEntryComparisonFilterOptions } from "./service";

export default async function MigrationPage() {
  await connection();
  const comparisonOptions = await getDataEntryComparisonFilterOptions();

  return (
    <div>
      <MigrationButtons />
      <DataEntryMigrationPanel />
      <DataEntryComparisonPanel options={comparisonOptions} />
    </div>
  );
}
