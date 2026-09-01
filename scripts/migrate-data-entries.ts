import { db } from "@/db/connection";
import {
  dataEntries,
  dataEntryLogs,
  inputDlDefMappings,
  DataEntryStatusId,
} from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { migrationLogs } from "@/db/schema/migration-log";
import { sql, eq } from "drizzle-orm";

const MIGRATION_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim() ?? "";

function log(msg: string) {
  console.log(msg);
}

async function fetchSource(path: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (MIGRATION_KEY) headers["x-migration-key"] = MIGRATION_KEY;
  const url = `https://prismdashboard.org/api/migration${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

async function logStep(label: string, ok: boolean, ms: number, recs: string) {
  try {
    await db.insert(migrationLogs).values({
      step_label: label,
      success: ok,
      duration_ms: ms,
      records_affected: recs,
    });
  } catch {}
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
function nk(v: number | null) {
  return v == null ? "n" : String(v);
}

const mapStatus = (row: Record<string, unknown>): DataEntryStatusId => {
  if (row.not_available) return 7;
  if (row.status_legacy_id != null) {
    switch (row.status_legacy_id) {
      case 5:
        return 4;
      case 6:
        return 5;
      case 7:
        return 3;
    }
  }
  if ((String(row.value ?? "")).trim().length > 0) return 3;
  return 2;
};

function esc(v: string): string {
  return v.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

async function main() {
  log("=== Batch Data Entry Migration ===\n");
  const t0 = Date.now();

  log("Cleaning...");
  await db.delete(dataEntryLogs);
  await db.delete(dataEntries);
  log("  Done.\n");

  log("Loading lookups...");
  const mappings = new Map<number, number>();
  for (const m of await db
    .select({
      t: inputDlDefMappings.training_dl_def_id,
      p: inputDlDefMappings.measure_def_id,
    })
    .from(inputDlDefMappings))
    mappings.set(m.t, m.p);
  const rpSet = new Set(
    (await db.select({ id: reportPeriods.id }).from(reportPeriods)).map(
      (r) => r.id,
    ),
  );
  const erSet = new Set(
    (await db.select({ id: energyResources.id }).from(energyResources)).map(
      (r) => r.id,
    ),
  );
  const saSet = new Set(
    (await db.select({ id: serviceAreas.id }).from(serviceAreas)).map(
      (r) => r.id,
    ),
  );
  const mliSet = new Set(
    (await db.select({ id: managedListItems.id }).from(managedListItems)).map(
      (r) => r.id,
    ),
  );
  log(
    `  Mappings:${mappings.size} RPs:${rpSet.size} ERs:${erSet.size} SAs:${saSet.size} MLI:${mliSet.size}\n`,
  );

  // Track existing keys (grows as we insert)
  const existingKeyToId = new Map<string, string>();

  let cursor: number | null = null;
  let hasMore = true;
  let pageNum = 0;
  let totalIns = 0,
    totalUpd = 0,
    skipRp = 0,
    skipDef = 0;

  while (hasMore) {
    pageNum++;
    const params = new URLSearchParams();
    params.set("limit", "2000");
    params.set("includeDeleted", "1");
    if (cursor != null) params.set("cursor", String(cursor));

    process.stderr.write(
      `  [page ${pageNum}] fetch cursor=${cursor ?? "null"}...`,
    );
    const page = await fetchSource(`/dataEntry?${params.toString()}`);
    const entries: Record<string, unknown>[] = page.dataEntry ?? [];
    if (entries.length === 0) break;
    process.stderr.write(` got ${entries.length}\n`);

    // Resolve rows
    type Row = {
      report_period_id: number;
      measure_def_id: number;
      service_area_id: number | null;
      energy_resource_id: number | null;
      energy_provider_id: number | null;
      energy_source_id: number | null;
      customer_type_id: number | null;
      payment_mode_id: number | null;
      update_medium_id: number | null;
      value: string | null;
      comments: string | null;
      status_id: number;
      is_relevant: boolean;
      is_deleted: boolean;
      updatedAt: string;
      key: string;
    };
    const rows: Row[] = [];
    const seenPage = new Set<string>();

    for (const row of entries) {
      const rpId = toNum(row.report_period_id);
      if (rpId == null || !rpSet.has(rpId)) {
        skipRp++;
        continue;
      }

      let inputDefId = toNum(row.measure_def_id);
      if (inputDefId != null) {
        const mapped = mappings.get(inputDefId);
        if (mapped != null) inputDefId = mapped;
      }
      if (inputDefId == null) {
        skipDef++;
        continue;
      }

      const sa = toNum(row.service_area_id);
      const er = toNum(row.energy_resource_id);
      const ep = toNum(row.energy_provider_id);
      const es = toNum(row.energy_source_id);
      const ct = toNum(row.customer_type_id);
      const pm = toNum(row.payment_mode_id);
      const um = toNum(row.update_medium_id);

      const fsa = sa && saSet.has(sa) ? sa : null;
      const fer = er && erSet.has(er) ? er : null;
      const fep = ep && mliSet.has(ep) ? ep : null;
      const fes = es && mliSet.has(es) ? es : null;
      const fct = ct && mliSet.has(ct) ? ct : null;
      const fpm = pm && mliSet.has(pm) ? pm : null;
      const fum = um && mliSet.has(um) ? um : null;

      const key = [
        rpId,
        inputDefId,
        nk(fsa),
        nk(fer),
        nk(fep),
        nk(fes),
        nk(fct),
        nk(fpm),
      ].join("|");
      if (seenPage.has(key)) continue;
      seenPage.add(key);

      const comments = row.comments?.trim() || null;
      rows.push({
        report_period_id: rpId,
        measure_def_id: inputDefId,
        service_area_id: fsa,
        energy_resource_id: fer,
        energy_provider_id: fep,
        energy_source_id: fes,
        customer_type_id: fct,
        payment_mode_id: fpm,
        update_medium_id: fum,
        value: row.value ?? null,
        comments,
        status_id: mapStatus(row),
        is_relevant: row.is_relevant ?? true,
        is_deleted: row.is_deleted ?? false,
        updatedAt: row.updated_at
          ? new Date(row.updated_at).toISOString()
          : new Date().toISOString(),
        key,
      });
    }

    if (rows.length === 0) {
      log(
        `  Page ${pageNum}: ${entries.length} src → 0 new (all duplicates/dups)`,
      );
    } else {
      // Separate into inserts and updates
      const toInsert: Row[] = [];
      const toUpdate: Row[] = [];
      for (const r of rows) {
        if (existingKeyToId.has(r.key)) {
          toUpdate.push(r);
        } else {
          toInsert.push(r);
        }
      }

      // Batch INSERT
      if (toInsert.length > 0) {
        const chunks = chunkArray(toInsert, 500);
        for (const chunk of chunks) {
          const values = chunk.map((r) => {
            const val = r.value != null ? `'${esc(r.value)}'` : "NULL";
            const cmt = r.comments
              ? `'${esc(JSON.stringify([{ comment: r.comments, commenterId: "migration", commenterName: "Migration", commenterRole: "system", date: r.updatedAt }]))}'::jsonb`
              : "NULL";
            return `(${r.report_period_id},${r.measure_def_id},${r.service_area_id ?? "NULL"},${r.energy_resource_id ?? "NULL"},${r.energy_provider_id ?? "NULL"},${r.energy_source_id ?? "NULL"},${r.customer_type_id ?? "NULL"},${r.payment_mode_id ?? "NULL"},${val},${cmt},${r.update_medium_id ?? "NULL"},${r.status_id},${r.is_deleted},${r.is_relevant},'${r.updatedAt}'::timestamp)`;
          });
          const result = await db.execute(
            sql.raw(`
            INSERT INTO data_entries (report_period_id, measure_def_id, service_area_id, energy_resource_id, energy_provider_id, energy_source_id, customer_type_id, payment_mode_id, value, comments, update_medium_id, status_id, is_deleted, is_relevant, "updated_at")
            VALUES ${values.join(",")}
            RETURNING id, report_period_id, measure_def_id, service_area_id, energy_resource_id, energy_provider_id, energy_source_id, customer_type_id, payment_mode_id
          `),
          );
          // Track new ids
          const returned = (result as { rows?: Record<string, unknown>[] })?.rows ?? [];
          for (const inserted of returned) {
            const k = [
              inserted.report_period_id,
              inserted.measure_def_id,
              nk(inserted.service_area_id),
              nk(inserted.energy_resource_id),
              nk(inserted.energy_provider_id),
              nk(inserted.energy_source_id),
              nk(inserted.customer_type_id),
              nk(inserted.payment_mode_id),
            ].join("|");
            existingKeyToId.set(k, inserted.id);
          }
          totalIns += chunk.length;
        }
      }

      // Batch UPDATE
      if (toUpdate.length > 0) {
        const chunks = chunkArray(toUpdate, 500);
        for (const chunk of chunks) {
          for (const r of chunk) {
            const id = existingKeyToId.get(r.key)!;
            await db
              .update(dataEntries)
              .set({
                value: r.value,
                status_id: r.status_id as unknown as DataEntryStatusId,
                is_relevant: r.is_relevant,
                is_deleted: r.is_deleted,
                update_medium_id: r.update_medium_id,
                updatedAt: new Date(r.updatedAt),
              })
              .where(eq(dataEntries.id, id));
          }
          totalUpd += chunk.length;
        }
      }

      log(
        `  Page ${pageNum}: ${entries.length} src → ins=${toInsert.length} upd=${toUpdate.length} (total ops: ${(totalIns + totalUpd).toLocaleString()})`,
      );
    }

    cursor = page.pagination?.nextCursor;
    hasMore = page.pagination?.hasMore === true && cursor != null;
  }

  const elapsed = Date.now() - t0;
  log(`\n=== Complete in ${(elapsed / 1000).toFixed(1)}s ===`);
  log(
    `  Inserted: ${totalIns.toLocaleString()}  Updated: ${totalUpd.toLocaleString()}  Ops: ${(totalIns + totalUpd).toLocaleString()}`,
  );
  log(`  Skipped RP: ${skipRp}  Def: ${skipDef}`);
  await logStep(
    "Data Entries (CLI)",
    true,
    elapsed,
    `inserted=${totalIns} updated=${totalUpd}`,
  );

  process.exit(0);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await logStep("Data Entries (CLI)", false, 0, "", String(err));
  } catch {}
  process.exit(1);
});
