/**
 * Gap scan (one-off): compare PRISM 2 data_entries coverage against the
 * prism-training source per measure, and tally the source `multiplier` field.
 *
 *   npx tsx scripts/_gap-scan.ts
 */
import "dotenv/config";

const MIG_URL = process.env.PRISM_TRAINING_MIGRATION_URL;
const MIG_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY;
const RAW_URL = process.env.PRISM_TRAINING_API_BASE_URL;
const RAW_KEY = process.env.PRISM_TRAINING_API_KEY;

async function main() {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const mapRes = await c.query(
    `select m.id measure_id, m.name, m.is_active, i.training_dl_def_id,
            (select count(*) from data_entries d where d.measure_def_id = m.id and not d.is_deleted) p2_rows,
            (select count(*) from data_entries d where d.measure_def_id = m.id and not d.is_deleted
               and (d.value_numeric is not null or d.value_boolean is not null or d.value_text is not null or d.value_option_id is not null)) p2_values
       from input_dl_def_mappings i join measure_definitions m on m.id = i.measure_def_id`,
  );
  await c.end();
  const mappedDls = new Set(mapRes.rows.map((r) => Number(r.training_dl_def_id)));

  // normalized feed (same shape the loaders consume)
  let cursor: number | null = null;
  let hasMore = true;
  const srcByDl = new Map<number, number>();
  while (hasMore) {
    const params = new URLSearchParams({ limit: "500", includeDeleted: "1" });
    if (cursor != null) params.set("cursor", String(cursor));
    const res = await fetch(`${MIG_URL}/dataEntry?${params}`, {
      headers: { "x-migration-key": MIG_KEY ?? "" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`dataEntry HTTP ${res.status}`);
    const page = (await res.json()) as {
      dataEntry: Array<{ input_def_id: number; is_deleted: boolean }>;
      pagination?: { nextCursor?: number; hasMore?: boolean };
    };
    for (const r of page.dataEntry ?? []) {
      if (!mappedDls.has(r.input_def_id)) continue;
      srcByDl.set(r.input_def_id, (srcByDl.get(r.input_def_id) ?? 0) + 1);
    }
    cursor = page.pagination?.nextCursor ?? null;
    hasMore = page.pagination?.hasMore === true && cursor != null;
    process.stdout.write(`scanned ${srcByDl.size ? "+" : ""}${(page.dataEntry ?? []).length}\r`);
  }
  console.log("");

  console.log("\nSOURCE has rows but PRISM 2 lacks matching values:");
  console.log("measure | active | name | src | p2_rows | p2_with_value");
  const gaps = mapRes.rows
    .map((r) => ({ ...r, src: srcByDl.get(Number(r.training_dl_def_id)) ?? 0 }))
    .filter((r) => r.src > 0 && Number(r.p2_values) < r.src)
    .sort((a, b) => b.src - a.src);
  for (const g of gaps) {
    console.log(
      `${g.measure_id} | ${g.is_active ? "active" : "INACTIVE"} | ${String(g.name).slice(0, 50)} | ${g.src} | ${g.p2_rows} | ${g.p2_values}`,
    );
  }
  console.log(`=> ${gaps.length} measures with gaps`);

  // multiplier from the raw table (single full-array response)
  console.log("\nfetching /api/dataEntryMain for multiplier distribution ...");
  const res = await fetch(`${RAW_URL}/dataEntryMain`, {
    headers: { Authorization: RAW_KEY ?? "" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`dataEntryMain HTTP ${res.status}`);
  const raw = (await res.json()) as Array<{ multiplier?: string | null }>;
  const mult = new Map<string, number>();
  for (const r of raw) {
    const k = r.multiplier ?? "<null>";
    mult.set(k, (mult.get(k) ?? 0) + 1);
  }
  console.log(`rows: ${raw.length}`);
  console.log("multiplier distribution:", [...mult.entries()].map(([k, v]) => `${k}:${v}`).join("  "));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  },
);
