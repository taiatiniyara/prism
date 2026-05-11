import { db } from "@/db/connection";
import { inputDefinitions, managedListItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/user.service";
import { asc, eq } from "drizzle-orm";
import ValidationBuilderClient from "@/app/dev/data-entry/validation-builder/builderClient";
import { getDevValidationBuilderConfig } from "@/app/dev/data-entry/validation-builder/service";

type InputDefinitionOption = {
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
        id: inputDefinitions.id,
        name: inputDefinitions.name,
        dataType: managedListItems.name,
        isMandatory: inputDefinitions.is_mandatory,
      })
      .from(inputDefinitions)
      .leftJoin(
        managedListItems,
        eq(inputDefinitions.data_type_id, managedListItems.id),
      )
      .where(eq(inputDefinitions.is_active, true))
      .orderBy(asc(inputDefinitions.name)),
  ]);

  const options: InputDefinitionOption[] = inputDefinitionRows.map((row) => ({
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
        inputDefinitions={options}
      />
    </div>
  );
}
