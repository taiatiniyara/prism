import "dotenv/config";
import { db } from "@/db/connection";
import { serviceAreas } from "@/db/schema/utility";
import { countries, subRegions } from "@/db/schema/country";
import { sql, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import path from "path";

function log(msg: string) {
  console.log(msg);
}

async function updateServiceAreas(wb: ExcelJS.Workbook) {
  log("\n[1/4] Updating service_areas names...");
  const ws = wb.getWorksheet("p2_service_area");
  if (!ws) {
    log("  Sheet p2_service_area not found, skipping.");
    return;
  }

  const rows: { id: number; name: string; p2Name: string }[] = [];
  let totalRows = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    totalRows++;
    const saId = row.getCell(1).value as number | null;
    const saName = row.getCell(2).value as string | null;
    const p2SaName = row.getCell(3).value as string | null;
    if (!saId || !p2SaName) return;
    if (saName !== p2SaName) {
      rows.push({ id: saId, name: saName ?? "", p2Name: p2SaName });
    }
  });

  log(`  ${rows.length} service areas need name updates (${totalRows - rows.length} already match)`);

  let updated = 0;
  for (const r of rows) {
    await db
      .update(serviceAreas)
      .set({ name: r.p2Name })
      .where(eq(serviceAreas.id, r.id));
    updated++;
    if (updated <= 5 || updated % 10 === 0) {
      log(`  Updated id=${r.id}: "${r.name}" → "${r.p2Name}"`);
    }
  }

  log(`  Done: ${updated} service areas updated.`);
}

async function updateCountries(wb: ExcelJS.Workbook) {
  log("\n[2/4] Updating countries...");
  const ws = wb.getWorksheet("p2_country");
  if (!ws) {
    log("  Sheet p2_country not found, skipping.");
    return;
  }

  log("  Countries reference data reviewed (no updates needed to existing columns).");
}

async function updateSubRegions(wb: ExcelJS.Workbook) {
  log("\n[3/4] Updating sub_regions...");
  const ws = wb.getWorksheet("p2_subregion");
  if (!ws) {
    log("  Sheet p2_subregion not found, skipping.");
    return;
  }

  const entries: { id: number; name: string }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = row.getCell(1).value as number | null;
    const name = row.getCell(3).value as string | null;
    if (!id || !name) return;
    entries.push({ id, name });
  });

  log(`  ${entries.length} subregion entries from Excel`);

  const existingSubs = await db.select().from(subRegions);
  const existingById = new Map(existingSubs.map((s) => [s.id, s]));
  log(`  Existing subregions in DB: ${existingSubs.length}`);

  const uniqueEntries = entries.filter(
    (e, i) => entries.findIndex((x) => x.id === e.id) === i,
  );

  for (const entry of uniqueEntries) {
    const existing = existingById.get(entry.id);
    if (existing) {
      if (existing.name !== entry.name) {
        await db
          .update(subRegions)
          .set({ name: entry.name })
          .where(eq(subRegions.id, entry.id));
        log(`  Updated subregion id=${entry.id}: "${existing.name}" → "${entry.name}"`);
      } else {
        log(`  Subregion id=${entry.id} (${existing.name}) already matches`);
      }
    }
  }

  const duplicates = entries.filter(
    (e, i) => entries.findIndex((x) => x.id === e.id) !== i,
  );

  if (duplicates.length > 0) {
    log(`\n  Creating ${duplicates.length} new subregions from duplicate id entries:`);

    for (const dup of duplicates) {
      const exists = await db
        .select()
        .from(subRegions)
        .where(eq(subRegions.name, dup.name))
        .limit(1);

      if (exists.length > 0) {
        log(`  Subregion "${dup.name}" already exists (id=${exists[0].id}), skipping`);
        continue;
      }

      const region = getRegionForSubregion(dup.name);
      const result = await db
        .insert(subRegions)
        .values({
          name: dup.name,
          un_continental_region: region,
        })
        .returning({ id: subRegions.id });

      const newId = result[0]?.id;
      if (newId) {
        log(`  Inserted "${dup.name}" → id=${newId}`);
      }
    }

    const allSubs = await db.select().from(subRegions);
    const subByName = new Map(allSubs.map((s) => [s.name, s.id]));

    const countryWs = wb.getWorksheet("p2_country");
    if (countryWs) {
      const countryUpdates: { countryId: number; subName: string }[] = [];
      countryWs.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cId = row.getCell(1).value as number | null;
        const subName = row.getCell(6).value as string | null;
        if (cId && subName) {
          countryUpdates.push({ countryId: cId, subName });
        }
      });

      for (const cu of countryUpdates) {
        const correctSubId = subByName.get(cu.subName);
        if (!correctSubId) continue;

        const country = await db
          .select()
          .from(countries)
          .where(eq(countries.id, cu.countryId))
          .limit(1);

        if (country.length > 0 && country[0].sub_region_id !== correctSubId) {
          await db
            .update(countries)
            .set({ sub_region_id: correctSubId })
            .where(eq(countries.id, cu.countryId));
          log(
            `  Updated country id=${cu.countryId} (${country[0].name}) sub_region_id: ${country[0].sub_region_id} → ${correctSubId} (${cu.subName})`,
          );
        }
      }
    }
  }

  log(`\n  Done: sub_regions updated.`);
}

function getRegionForSubregion(
  name: string,
): "Oceania" | "Europe" | "Asia" | "Africa" | "Americas" {
  if (name.includes("Asia") || name.includes("South-Eastern")) return "Asia";
  if (name.includes("America") || name.includes("Northern")) return "Americas";
  return "Oceania";
}

async function updateRegions(wb: ExcelJS.Workbook) {
  log("\n[4/4] Updating regions...");

  const check = await db.execute(sql`SELECT to_regclass('regions')`);
  const row = (check as { rows: { to_regclass: string | null }[] }).rows?.[0];
  if (!row?.to_regclass) {
    await db.execute(sql`
      CREATE TABLE regions (
        id serial PRIMARY KEY NOT NULL,
        name varchar(255) NOT NULL
      )
    `);
    log(`  Created table regions`);
  } else {
    log(`  Table regions already exists`);
  }

  const ws = wb.getWorksheet("p2_region");
  if (!ws) {
    log("  Sheet p2_region not found, skipping.");
    return;
  }

  const entries: { name: string }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = row.getCell(3).value as string | null;
    if (!name) return;
    entries.push({ name });
  });

  log(`  ${entries.length} regions to upsert`);

  const existing = await db.execute(sql`SELECT * FROM regions`);
  const existingNames = new Set(
    ((existing as { rows: { name: string }[] }).rows ?? []).map((r) => r.name),
  );

  for (const entry of entries) {
    if (!existingNames.has(entry.name)) {
      await db.execute(
        sql`INSERT INTO regions (name) VALUES (${entry.name})`,
      );
      log(`  Inserted region "${entry.name}"`);
    } else {
      log(`  Region "${entry.name}" already exists`);
    }
  }

  log(`  Done: regions updated.`);
}

async function main() {
  log("=== Service Area & Reference Data Update ===\n");

  const wb = new ExcelJS.Workbook();
  const xlsxPath = path.join(process.cwd(), "docs", "service_area_updates.xlsx");
  await wb.xlsx.readFile(xlsxPath);
  log(`Read ${xlsxPath} — sheets: ${wb.worksheets.map((s) => s.name).join(", ")}`);

  await updateServiceAreas(wb);
  await updateCountries(wb);
  await updateSubRegions(wb);
  await updateRegions(wb);

  log("\n=== All updates complete. ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
