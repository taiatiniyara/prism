/**
 * Backfill UN M49 codes onto `countries` and `sub_regions` (stream #13).
 *
 * Source of truth: db/seed-data/un-m49.csv (UNSD M49, semicolon-delimited).
 * - countries:   matched to the CSV by ISO alpha-3 → sets `m49_code`.
 * - sub_regions: matched by name → sets `m49_code` (sub-region code) and
 *                `un_region_m49_code` (its parent region code, e.g. Oceania 009).
 *
 * Safe + idempotent: only additive columns are written; nothing else changes.
 * Run the DDL first (db/migrations/2026-07-27-country-m49-codes.sql), then:
 *   npx tsx scripts/backfill-m49-codes.ts --dry-run   # report only, no writes
 *   npx tsx scripts/backfill-m49-codes.ts             # apply
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { countries, subRegions } from "@/db/schema/country";

const DRY_RUN = process.argv.includes("--dry-run");
const CSV_PATH = resolve(process.cwd(), "db/seed-data/un-m49.csv");

interface M49Row {
  regionCode: string;
  regionName: string;
  subRegionCode: string;
  subRegionName: string;
  m49Code: string;
  isoAlpha3: string;
}

const parseCsv = (): M49Row[] => {
  const text = readFileSync(CSV_PATH, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(";");
  const idx = (name: string) => header.findIndex((h) => h.trim() === name);

  const iRegionCode = idx("Region Code");
  const iRegionName = idx("Region Name");
  const iSubCode = idx("Sub-region Code");
  const iSubName = idx("Sub-region Name");
  const iM49 = idx("M49 Code");
  const iIso3 = idx("ISO-alpha3 Code");

  return lines.slice(1).map((line) => {
    const c = line.split(";");
    return {
      regionCode: c[iRegionCode]?.trim() ?? "",
      regionName: c[iRegionName]?.trim() ?? "",
      subRegionCode: c[iSubCode]?.trim() ?? "",
      subRegionName: c[iSubName]?.trim() ?? "",
      m49Code: c[iM49]?.trim() ?? "",
      isoAlpha3: c[iIso3]?.trim().toUpperCase() ?? "",
    };
  });
};

async function main() {
  const rows = parseCsv();

  const byIso = new Map<string, M49Row>();
  const bySubRegion = new Map<string, { subRegionCode: string; regionCode: string }>();
  for (const r of rows) {
    if (r.isoAlpha3) byIso.set(r.isoAlpha3, r);
    if (r.subRegionCode && r.subRegionName) {
      bySubRegion.set(r.subRegionName.toLowerCase(), {
        subRegionCode: r.subRegionCode,
        regionCode: r.regionCode,
      });
    }
  }

  console.log(
    `Loaded ${rows.length} M49 rows (${byIso.size} countries, ${bySubRegion.size} sub-regions).`,
  );
  console.log(DRY_RUN ? "\n=== DRY RUN (no writes) ===\n" : "\n=== APPLYING ===\n");

  // --- countries ---
  const dbCountries = await db
    .select({
      id: countries.id,
      name: countries.name,
      iso3: countries.iso_code_alpha3,
      m49: countries.m49_code,
    })
    .from(countries);

  let cMatched = 0;
  const cUnmatched: string[] = [];
  for (const country of dbCountries) {
    const hit = byIso.get((country.iso3 ?? "").toUpperCase());
    if (!hit) {
      cUnmatched.push(`${country.name} (iso3=${country.iso3 ?? "∅"})`);
      continue;
    }
    cMatched++;
    if (!DRY_RUN && country.m49 !== hit.m49Code) {
      await db
        .update(countries)
        .set({ m49_code: hit.m49Code })
        .where(eq(countries.id, country.id));
    }
  }

  // --- sub_regions ---
  const dbSubRegions = await db
    .select({ id: subRegions.id, name: subRegions.name })
    .from(subRegions);

  let sMatched = 0;
  const sUnmatched: string[] = [];
  for (const sr of dbSubRegions) {
    const hit = bySubRegion.get((sr.name ?? "").trim().toLowerCase());
    if (!hit) {
      sUnmatched.push(sr.name);
      continue;
    }
    sMatched++;
    if (!DRY_RUN) {
      await db
        .update(subRegions)
        .set({ m49_code: hit.subRegionCode, un_region_m49_code: hit.regionCode })
        .where(eq(subRegions.id, sr.id));
    }
  }

  console.log(
    `Countries:   ${cMatched}/${dbCountries.length} matched by ISO alpha-3.`,
  );
  if (cUnmatched.length) {
    console.log(`  ⚠ UNMATCHED (${cUnmatched.length}):`);
    cUnmatched.forEach((c) => console.log(`    - ${c}`));
  }
  console.log(`Sub-regions: ${sMatched}/${dbSubRegions.length} matched by name.`);
  if (sUnmatched.length) {
    console.log(`  ⚠ UNMATCHED (${sUnmatched.length}):`);
    sUnmatched.forEach((s) => console.log(`    - ${s}`));
  }

  if (cUnmatched.length || sUnmatched.length) {
    console.log(
      "\n⚠ Some rows did not match — resolve (bad/missing ISO code or a non-UN sub-region name) before relying on m49_code as NOT NULL.",
    );
  } else {
    console.log("\n✓ Every country and sub-region matched a UN M49 code.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
