import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

// Loads AI-drafted dictionary definitions into measure_definitions  / kpi_definitions.
// Rules: never overwrite 'curated' rows; overwrite existing 'draft'/empty rows only
// when --force is passed, otherwise fill blanks only.
const FORCE = process.argv.includes("--force");
const DIR = "docs/dictionary-drafts";

interface DraftRow {
  id: number;
  definition: string;
  synonyms: string[];
}

async function applyMigration() {
  const ddl = readFileSync(
    "db/migrations/0031_dictionary_definitions.sql",
    "utf8",
  );
  await db.execute(sql.raw(ddl));
}

async function loadTable(
  table: "measure_definitions " | "kpi_definitions",
  file: string,
) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const rows: DraftRow[] = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const guard = FORCE
      ? sql`coalesce(definition_status, '') <> 'curated'`
      : sql`definition_status IS NULL`;
    const res = await db.execute(sql`
      UPDATE ${sql.raw(table)}
      SET definition = ${r.definition},
          synonyms = ${JSON.stringify(r.synonyms)}::json,
          definition_status = 'draft'
      WHERE id = ${r.id} AND ${guard}
    `);
    const count = (res as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) updated += 1;
    else skipped += 1;
  }
  console.log(
    `${table}: ${updated} updated, ${skipped} skipped (of ${rows.length})`,
  );
}

async function main() {
  await applyMigration();
  console.log("migration 0031 applied (idempotent)");
  await loadTable("measure_definitions ", "dictionary-inputs.json");
  await loadTable("kpi_definitions", "dictionary-kpis.json");

  const verify = await db.execute(sql`
    SELECT 'inputs' AS t,
           count(*) FILTER (WHERE definition_status = 'draft')::int AS draft,
           count(*) FILTER (WHERE definition_status = 'curated')::int AS curated
    FROM measure_definitions  WHERE is_active
    UNION ALL
    SELECT 'kpis',
           count(*) FILTER (WHERE definition_status = 'draft')::int,
           count(*) FILTER (WHERE definition_status = 'curated')::int
    FROM kpi_definitions WHERE is_active
  `);
  console.log(JSON.stringify(verify.rows ?? verify));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
