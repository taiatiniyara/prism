import { db } from "@/db/connection";
import { inputRelevance, inputDlDefMappings } from "@/db/schema/dataEntry";
import { sql, inArray } from "drizzle-orm";

const KEY = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim()!;

async function fetchSource(path: string) {
  const url = `https://prismdashboard.org/api/migration${path}`;
  const res = await fetch(url, {
    headers: { "x-migration-key": KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  console.log("=== Sync Generation Relevance → input_relevance ===\n");

  // Load training ID → prism input_def_id mappings
  const mappings = new Map<number, number>();
  for (const m of await db.select({
    training: inputDlDefMappings.training_dl_def_id,
    prism: inputDlDefMappings.input_def_id,
  }).from(inputDlDefMappings)) {
    mappings.set(m.training, m.prism);
  }
  console.log(`Mappings loaded: ${mappings.size}`);

  // Clear existing input_relevance
  await db.delete(inputRelevance);
  console.log("Cleared existing input_relevance");

  let cursor: number | null = null;
  let hasMore = true;
  let pages = 0;
  let inserted = 0;
  let skipped = 0;

  while (hasMore) {
    const params = new URLSearchParams();
    params.set("limit", "500");
    if (cursor != null) params.set("cursor", String(cursor));

    const page = await fetchSource(`/generationRelevance?${params.toString()}`);
    const rows: Array<{
      training_dl_def_id: number;
      energy_source_id: number;
      is_relevant: boolean;
    }> = page.generationRelevance ?? [];
    if (rows.length === 0) break;
    pages++;

    const values: string[] = [];
    for (const row of rows) {
      const prismDefId = mappings.get(row.training_dl_def_id);
      if (!prismDefId) { skipped++; continue; }
      values.push(`(${prismDefId},${row.energy_source_id},${row.is_relevant})`);
    }

    if (values.length > 0) {
      await db.execute(sql.raw(
        `INSERT INTO input_relevance (input_def_id, dimension_id, is_relevant) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`
      ));
      inserted += values.length;
    }

    cursor = page.pagination?.nextCursor;
    hasMore = page.pagination?.hasMore === true && cursor != null;

    if (pages % 20 === 0) console.log(`  Page ${pages}: inserted ${inserted}, skipped ${skipped}...`);
  }

  console.log(`\nDone. ${pages} pages, ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped (no mapping)`);

  const total = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(inputRelevance);
  console.log(`Total input_relevance rows: ${total[0].cnt.toLocaleString()}`);

  process.exit(0);
}
main().catch(console.error);
