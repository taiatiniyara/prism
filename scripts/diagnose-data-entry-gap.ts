import { count, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { inputDlDefMappings } from "@/db/schema/dataEntry";

const MIGRATION_URL = process.env.PRISM_TRAINING_MIGRATION_URL?.trim();
const MIGRATION_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim();

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  const result = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (result.toLowerCase().endsWith("/api/migration")) return result;
  if (result.toLowerCase().endsWith("/api")) return `${result}/migration`;
  return `${result}/api/migration`;
}

const baseUrl = normalizeBaseUrl(MIGRATION_URL!);

async function fetchSource(path: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (MIGRATION_KEY) headers["x-migration-key"] = MIGRATION_KEY;
  const url = `${baseUrl}${path}`;
  console.error(`  GET ${url}`);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${path}`);
  return res.json();
}

async function main() {
  console.log("=== Deep Data Entry Gap Diagnostic ===\n");

  // ─── 1. Paginate ALL source entries to get full status distribution ──
  console.log("--- Source (prism-training) full scan ---");
  let cursor: number | null = null;
  let hasMore = true;
  let totalSource = 0;
  const sourceStatusCounts: Record<string, number> = {};
  const sourceNotAvail = { yes: 0, no: 0 };
  const sourceDeleted = { yes: 0, no: 0 };
  const sourceWithValue = { yes: 0, no: 0 };
  const sourceDlDefIds = new Set<number>();
  const sourceDlDefNames = new Map<number, string>();
  const sourceRpIds = new Set<number>();
  let pages = 0;

  while (hasMore) {
    const params = new URLSearchParams();
    params.set("limit", "2000");
    params.set("includeDeleted", "1");
    if (cursor != null) params.set("cursor", String(cursor));

    const page = await fetchSource(`/dataEntry?${params.toString()}`);
    const entries = page.dataEntry ?? [];
    if (entries.length === 0) break;

    totalSource += entries.length;
    pages++;
    if (pages <= 3) {
      console.error(
        `  Page ${pages}: ${entries.length} entries, nextCursor=${page.pagination?.nextCursor}`,
      );
    }

    for (const row of entries) {
      const sid = String(row.status_legacy_id ?? "null");
      sourceStatusCounts[sid] = (sourceStatusCounts[sid] ?? 0) + 1;
      if (row.not_available) sourceNotAvail.yes++;
      else sourceNotAvail.no++;
      if (row.is_deleted) sourceDeleted.yes++;
      else sourceDeleted.no++;
      if ((row.value ?? "").trim().length > 0) sourceWithValue.yes++;
      else sourceWithValue.no++;
      if (row.measure_def_id != null) {
        sourceDlDefIds.add(row.measure_def_id);
        if (row.input_def_name && !sourceDlDefNames.has(row.measure_def_id)) {
          sourceDlDefNames.set(row.measure_def_id, row.input_def_name);
        }
      }
      if (row.report_period_id != null) sourceRpIds.add(row.report_period_id);
    }

    cursor = page.pagination?.nextCursor;
    hasMore = page.pagination?.hasMore === true && cursor != null;
    if (pages >= 50) {
      hasMore = false;
      console.error("  (truncated at 50 pages)");
    }
  }

  console.log(
    `\n  Total source entries sampled: ${totalSource.toLocaleString()} (${pages} pages)`,
  );
  console.log(`  Unique source dl_def_ids: ${sourceDlDefIds.size}`);
  console.log(`  Unique source report_period_ids: ${sourceRpIds.size}`);
  console.log(
    `  Source not_available: yes=${sourceNotAvail.yes.toLocaleString()}, no=${sourceNotAvail.no.toLocaleString()}`,
  );
  console.log(
    `  Source is_deleted: yes=${sourceDeleted.yes.toLocaleString()}, no=${sourceDeleted.no.toLocaleString()}`,
  );
  console.log(
    `  Source with value: ${sourceWithValue.yes.toLocaleString()}, without: ${sourceWithValue.no.toLocaleString()}`,
  );

  console.log("\n  Full source status_id distribution:");
  const sortedStatuses = Object.entries(sourceStatusCounts).sort(
    ([, a], [, b]) => b - a,
  );
  for (const [sid, cnt] of sortedStatuses) {
    const label =
      sid === "1"
        ? "Requested"
        : sid === "2"
          ? "Pending"
          : sid === "3"
            ? "Entered"
            : sid === "5"
              ? "Reviewed"
              : sid === "6"
                ? "Approved"
                : sid === "7"
                  ? "Uploaded"
                  : sid === "null"
                    ? "null"
                    : `?`;
    console.log(`    ${label} (${sid}): ${cnt.toLocaleString()}`);
  }

  // ─── 2. Check mapping coverage ──────────────────────────────────────
  console.log("\n--- Input DL Def Mapping Coverage ---");
  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
    })
    .from(inputDlDefMappings);
  const mappedIds = new Set(mappingRows.map((m) => m.trainingDlDefId));
  const unmappedIds = [...sourceDlDefIds].filter((id) => !mappedIds.has(id));

  console.log(`  Source dl_def_ids: ${sourceDlDefIds.size}`);
  console.log(`  Mapped in prism:   ${mappedIds.size}`);
  console.log(`  Unmapped:          ${unmappedIds.length}`);

  if (unmappedIds.length > 0 && unmappedIds.length <= 30) {
    console.log("  Unmapped dl_def_ids:");
    for (const id of unmappedIds.sort((a, b) => a - b)) {
      console.log(`    ${id}: ${sourceDlDefNames.get(id) ?? "unknown"}`);
    }
  } else if (unmappedIds.length > 30) {
    console.log("  First 30 unmapped dl_def_ids:");
    for (const id of unmappedIds.sort((a, b) => a - b).slice(0, 30)) {
      console.log(`    ${id}: ${sourceDlDefNames.get(id) ?? "unknown"}`);
    }
  }

  // ─── 3. Estimate expected prism count ───────────────────────────────
  // Count how many source entries have mapped dl_def_ids AND valid report_periods
  const targetRpIds = new Set(
    (await db.select({ id: reportPeriods.id }).from(reportPeriods)).map(
      (r) => r.id,
    ),
  );

  const expectedMapped = sourceDlDefIds.size - unmappedIds.length;
  const rpOverlap = [...sourceRpIds].filter((id) => targetRpIds.has(id)).length;
  console.log(`\n  Source rp_ids: ${sourceRpIds.size}, in prism: ${rpOverlap}`);
  console.log(
    `  Unmapped dl_def_ids: ${unmappedIds.length} (${((unmappedIds.length / sourceDlDefIds.size) * 100).toFixed(1)}% of source)`,
  );

  // ─── 4. Prism side breakdown ────────────────────────────────────────
  console.log("\n--- Prism (target) full breakdown ---");

  const activePrism = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.is_deleted} = false`);
  console.log(`  Active entries: ${activePrism[0].cnt.toLocaleString()}`);

  const byStatus = await db
    .select({ status_id: dataEntries.status_id, cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.is_deleted} = false`)
    .groupBy(dataEntries.status_id)
    .orderBy(dataEntries.status_id);

  const statusLabels: Record<number, string> = {
    1: "Requested",
    2: "Pending",
    3: "Entered",
    4: "Reviewed",
    5: "Approved",
    7: "Not_Available",
  };
  console.log("  By status:");
  for (const s of byStatus) {
    console.log(
      `    ${statusLabels[s.status_id] ?? `?(${s.status_id})`}: ${s.cnt.toLocaleString()}`,
    );
  }

  // ─── 5. Potential gaps ──────────────────────────────────────────────
  console.log("\n--- Gap Analysis ---");
  console.log(`  Total source: ~${totalSource.toLocaleString()}`);
  console.log(`  Total prism:  ${activePrism[0].cnt.toLocaleString()}`);
  const estimatedDelta =
    totalSource * (unmappedIds.length / sourceDlDefIds.size);
  console.log(
    `  ~${estimatedDelta.toLocaleString(0)} entries likely unmatched due to input def mapping gaps`,
  );
  console.log(
    `  Remaining gap ~${(totalSource - activePrism[0].cnt - estimatedDelta).toLocaleString()}`,
  );

  console.log("\n--- Action Plan ---");
  console.log(
    "1. Run 'Sync Input DL Def Mappings' on /migration to map unmapped definitions",
  );
  console.log("2. Run 'Data Entries' migration after mappings are updated");
  console.log("3. Re-run this diagnostic to verify gap closure");

  process.exit(0);
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
