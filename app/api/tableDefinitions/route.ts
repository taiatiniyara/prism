import { getTableName } from "drizzle-orm";
import { assertMigrationKey } from "../migration/prism-training/_lib";
import * as schema from "@/db/schema";

function isColumn(
  obj: unknown,
): obj is { name: string; dataType: string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "dataType" in obj &&
    "columnType" in obj
  );
}

function extractTableDefinitions(
  schemaModule: Record<string, unknown>,
): Record<string, { column: string; type: string }[]> {
  const tables: Record<string, { column: string; type: string }[]> = {};

  for (const [, tableObj] of Object.entries(schemaModule)) {
    if (typeof tableObj !== "object" || tableObj === null) continue;

    const columns: { column: string; type: string }[] = [];
    for (const [, value] of Object.entries(tableObj)) {
      if (isColumn(value)) {
        columns.push({ column: value.name, type: value.dataType });
      }
    }

    if (columns.length === 0) continue;

    try {
      const tableName = getTableName(tableObj as Parameters<typeof getTableName>[0]);
      tables[tableName] = columns;
    } catch {
      // not a drizzle table — skip
    }
  }

  return tables;
}

export async function GET(req: Request) {
  assertMigrationKey(req);
  return Response.json(extractTableDefinitions(schema as Record<string, unknown>));
}
