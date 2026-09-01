import { db } from "@/db/connection";
import { measureDefinitions, managedListItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/user.service";
import { asc, eq } from "drizzle-orm";
import { getDevValidationBuilderConfig } from "./service";
import ValidationBuilderClient from "./builderClient";

type MeasureDefinitionOption = {
  id: number;
  name: string;
  dataType: string;
  isMandatory: boolean;
};

export default async function DevValidationBuilderPage() {
  const user = await getCurrentUser();

  if (user.role !== "DEV") {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Unauthorized: DEV role required.
      </div>
    );
  }

  const [configResult, inputDefinitionRows] = await Promise.all([
    getDevValidationBuilderConfig(),
    db
      .select({
        id: measureDefinitions.id,
        name: measureDefinitions.name,
        dataType: managedListItems.name,
        isMandatory: measureDefinitions.is_mandatory,
      })
      .from(measureDefinitions)
      .leftJoin(
        managedListItems,
        eq(measureDefinitions.data_type_id, managedListItems.id),
      )
      .where(eq(measureDefinitions.is_active, true))
      .orderBy(asc(measureDefinitions.name)),
  ]);

  const options: MeasureDefinitionOption[] = inputDefinitionRows.map((row) => ({
    id: row.id,
    name: row.name,
    dataType: row.dataType ?? "Unknown",
    isMandatory: row.isMandatory,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Validation Builder</h1>
        <p className="text-sm text-muted-foreground">
          DEV-only controls for data-entry validation behavior.
        </p>
      </div>

      <ValidationBuilderClient
        initialConfig={configResult.data}
        measureDefinitions={options}
      />
    </div>
  );
}
