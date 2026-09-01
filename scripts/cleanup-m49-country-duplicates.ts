/**
 * One-off cleanup: remove the pre-M49-migration duplicate rows in `countries`
 * and `sub_regions` (stream #13, Option 1 — adopt UN M49 as the primary key).
 *
 * Context: the DB was re-keyed so live country/sub-region rows use the UN M49
 * code as their `id` (Fiji 242, NZ 554, Melanesia 54 …), and organisations were
 * re-pointed to those. The old serial-id rows were left behind as unreferenced
 * orphans, and a few keeper countries still sat on the old sub-region rows.
 * This re-points those keepers and deletes the orphans.
 *
 * RUN AGAINST THE DEV DB 2026-07-27 (committed): re-pointed 22 countries
 * (sub_region 2→54, 3→57, 4→61), deleted 26 orphan countries, deleted 3 old
 * sub_region rows → 0 duplicate iso3 groups / 0 duplicate sub-region names.
 * Backups: backup.countries_20260727, backup.sub_regions_20260727.
 * Retained for the record + to re-run on other environments (prod).
 *
 * Safety:
 *  - default is DRY RUN; pass --apply to write.
 *  - snapshots both tables into backup.* before any delete.
 *  - a row is only deleted after its reference count across ALL foreign keys is
 *    verified to be 0; the whole thing runs in one transaction and ABORTS if any
 *    delete candidate is still referenced.
 *
 *   npx tsx scripts/cleanup-m49-country-duplicates.ts            # dry run
 *   npx tsx scripts/cleanup-m49-country-duplicates.ts --apply    # execute
 */
import "dotenv/config";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.argv.includes("--apply");

function loadIsoToM49(): Map<string, number> {
  const text = readFileSync(resolve(process.cwd(), "db/seed-data/un-m49.csv"), "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0].split(";");
  const iIso = h.findIndex((x) => x.trim() === "ISO-alpha3 Code");
  const iM49 = h.findIndex((x) => x.trim() === "M49 Code");
  const m = new Map<string, number>();
  for (const l of lines.slice(1)) {
    const c = l.split(";");
    if (c[iIso]?.trim()) m.set(c[iIso].trim().toUpperCase(), Number(c[iM49].trim()));
  }
  return m;
}

const STAMP = "20260727";
const COUNTRY_FKS: [string, string][] = [
  ["country_context", "country_id"],
  ["data_entries", "country_id"],
  ["organisations", "country_id"],
];
const SUBREGION_FKS: [string, string][] = [
  ["countries", "sub_region_id"],
  ["data_entries", "subregion_id"],
];
// old serial sub-region id → its UN M49 keeper id
const SUBREGION_REPOINT: [number, number][] = [
  [2, 54], // Melanesia
  [3, 57], // Micronesia
  [4, 61], // Polynesia
];

async function main() {
  const isoToM49 = loadIsoToM49();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const cs = await client.query<{ id: number; name: string; iso3: string }>(
      `SELECT id, name, upper(iso_code_alpha3) iso3 FROM countries`,
    );
    const byIso = new Map<string, { id: number; name: string; iso3: string }[]>();
    for (const r of cs.rows) {
      if (!byIso.has(r.iso3)) byIso.set(r.iso3, []);
      byIso.get(r.iso3)!.push(r);
    }
    const notKeeper: { id: number; name: string; iso3: string }[] = [];
    for (const [iso, rows] of byIso) {
      if (rows.length < 2) continue;
      const trueM49 = isoToM49.get(iso);
      for (const r of rows) {
        if (!(trueM49 != null && r.id === trueM49)) notKeeper.push(r);
      }
    }

    const refCount = async (fks: [string, string][], id: number) => {
      let t = 0;
      for (const [tb, co] of fks) {
        const r = await client.query(`SELECT count(*)::int n FROM "${tb}" WHERE "${co}" = $1`, [id]);
        t += r.rows[0].n;
      }
      return t;
    };

    const deletable: typeof notKeeper = [];
    const keptReferenced: typeof notKeeper = [];
    for (const r of notKeeper) {
      const refs = await refCount(COUNTRY_FKS, r.id);
      (refs === 0 ? deletable : keptReferenced).push(r);
    }
    console.log(`Country dup non-keeper rows: ${notKeeper.length} (deletable ${deletable.length}, kept-referenced ${keptReferenced.map((r) => `${r.id}:${r.name}`).join(",") || "none"})`);
    console.log(`  delete ids: ${JSON.stringify(deletable.map((r) => r.id).sort((a, b) => a - b))}`);

    const sr = await client.query<{ id: number; name: string }>(`SELECT id, name FROM sub_regions`);
    const srByName = new Map<string, { id: number; name: string }[]>();
    for (const r of sr.rows) {
      const k = r.name.toLowerCase();
      if (!srByName.has(k)) srByName.set(k, []);
      srByName.get(k)!.push(r);
    }
    const UN_SUBREGION_CODES = new Set([53, 54, 57, 61, 21, 35, 9]);
    const srDeleteCandidates: { id: number; name: string }[] = [];
    for (const [, rows] of srByName) {
      if (rows.length < 2) continue;
      const keeper = rows.find((r) => UN_SUBREGION_CODES.has(r.id));
      if (!keeper) continue;
      for (const r of rows) if (r.id !== keeper.id) srDeleteCandidates.push(r);
    }
    console.log(`Old sub-region dup rows: ${srDeleteCandidates.map((r) => `${r.id}:${r.name}`).join(", ") || "none"}`);

    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA IF NOT EXISTS backup`);
    await client.query(`DROP TABLE IF EXISTS backup.countries_${STAMP}`);
    await client.query(`DROP TABLE IF EXISTS backup.sub_regions_${STAMP}`);
    await client.query(`CREATE TABLE backup.countries_${STAMP} AS SELECT * FROM countries`);
    await client.query(`CREATE TABLE backup.sub_regions_${STAMP} AS SELECT * FROM sub_regions`);

    for (const [oldId, newId] of SUBREGION_REPOINT) {
      const res = await client.query(`UPDATE countries SET sub_region_id = $1 WHERE sub_region_id = $2`, [newId, oldId]);
      if (res.rowCount) console.log(`Re-pointed ${res.rowCount} countries: sub_region ${oldId} → ${newId}`);
    }

    for (const r of deletable) {
      const refs = await refCount(COUNTRY_FKS, r.id);
      if (refs !== 0) throw new Error(`ABORT: country id=${r.id} (${r.name}) now has ${refs} refs`);
      await client.query(`DELETE FROM countries WHERE id = $1`, [r.id]);
    }
    console.log(`Deleted ${deletable.length} orphan countries.`);

    let srDeleted = 0;
    const srSkipped: string[] = [];
    for (const r of srDeleteCandidates) {
      const refs = await refCount(SUBREGION_FKS, r.id);
      if (refs !== 0) {
        srSkipped.push(`${r.id}:${r.name} (${refs} refs)`);
        continue;
      }
      await client.query(`DELETE FROM sub_regions WHERE id = $1`, [r.id]);
      srDeleted++;
    }
    console.log(`Deleted ${srDeleted} old sub_region rows.${srSkipped.length ? " skipped: " + srSkipped.join(", ") : ""}`);

    const cDupsLeft = await client.query(`SELECT count(*)::int n FROM (SELECT upper(iso_code_alpha3) i FROM countries GROUP BY 1 HAVING count(*)>1) t`);
    const sDupsLeft = await client.query(`SELECT count(*)::int n FROM (SELECT lower(name) nm FROM sub_regions GROUP BY 1 HAVING count(*)>1) t`);
    console.log(`Post-cleanup: duplicate iso3 groups=${cDupsLeft.rows[0].n}, duplicate sub_region names=${sDupsLeft.rows[0].n}`);

    if (APPLY && srSkipped.length === 0) {
      await client.query("COMMIT");
      console.log("✅ COMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log(APPLY ? "⛔ ROLLED BACK (skips present)." : "(dry run) ROLLED BACK — re-run with --apply to commit.");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  },
);
