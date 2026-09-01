import "dotenv/config";
import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import path from "path";

function log(msg: string) {
  console.log(msg);
}

const DROP_FKS = [
  sql`ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_sub_region_id_sub_regions_id_fk`,
  sql`ALTER TABLE data_entries DROP CONSTRAINT IF EXISTS data_entries_subregion_id_sub_regions_id_fk`,
  sql`ALTER TABLE service_areas DROP CONSTRAINT IF EXISTS service_areas_utility_id_organisations_id_fk`,
  sql`ALTER TABLE power_stations DROP CONSTRAINT IF EXISTS power_stations_utility_id_organisations_id_fk`,
  sql`ALTER TABLE energy_resources DROP CONSTRAINT IF EXISTS energy_resources_utility_id_organisations_id_fk`,
  sql`ALTER TABLE power_stations DROP CONSTRAINT IF EXISTS power_stations_service_area_id_service_areas_id_fk`,
  sql`ALTER TABLE energy_resources DROP CONSTRAINT IF EXISTS energy_resources_service_area_id_service_areas_id_fk`,
  sql`ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_country_id_countries_id_fk`,
  sql`ALTER TABLE country_context DROP CONSTRAINT IF EXISTS country_context_country_id_countries_id_fk`,
  sql`ALTER TABLE data_entries DROP CONSTRAINT IF EXISTS data_entries_country_id_countries_id_fk`,
];

const RECREATE_FKS = [
  sql`ALTER TABLE countries ADD CONSTRAINT countries_sub_region_id_sub_regions_id_fk FOREIGN KEY (sub_region_id) REFERENCES sub_regions(id)`,
  sql`ALTER TABLE data_entries ADD CONSTRAINT data_entries_subregion_id_sub_regions_id_fk FOREIGN KEY (subregion_id) REFERENCES sub_regions(id)`,
  sql`ALTER TABLE service_areas ADD CONSTRAINT service_areas_utility_id_organisations_id_fk FOREIGN KEY (utility_id) REFERENCES organisations(id)`,
  sql`ALTER TABLE power_stations ADD CONSTRAINT power_stations_utility_id_organisations_id_fk FOREIGN KEY (utility_id) REFERENCES organisations(id)`,
  sql`ALTER TABLE energy_resources ADD CONSTRAINT energy_resources_utility_id_organisations_id_fk FOREIGN KEY (utility_id) REFERENCES organisations(id)`,
  sql`ALTER TABLE power_stations ADD CONSTRAINT power_stations_service_area_id_service_areas_id_fk FOREIGN KEY (service_area_id) REFERENCES service_areas(id)`,
  sql`ALTER TABLE energy_resources ADD CONSTRAINT energy_resources_service_area_id_service_areas_id_fk FOREIGN KEY (service_area_id) REFERENCES service_areas(id)`,
  sql`ALTER TABLE organisations ADD CONSTRAINT organisations_country_id_countries_id_fk FOREIGN KEY (country_id) REFERENCES countries(id)`,
  sql`ALTER TABLE country_context ADD CONSTRAINT country_context_country_id_countries_id_fk FOREIGN KEY (country_id) REFERENCES countries(id)`,
  sql`ALTER TABLE data_entries ADD CONSTRAINT data_entries_country_id_countries_id_fk FOREIGN KEY (country_id) REFERENCES countries(id)`,
];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), "docs", "service_area_updates.xlsx"));

  log("=== Updating IDs to match p2_id values ===\n");

  log("[0] Dropping foreign key constraints...");
  for (const q of DROP_FKS) {
    await db.execute(q);
  }
  log(`  Dropped ${DROP_FKS.length} FK constraints`);

  try {
    log("\n[1] Updating sub_regions IDs...");
    const srWs = wb.getWorksheet("p2_subregion");
    if (srWs) {
      const updates: { oldId: number; newId: number; name: string }[] = [];
      const inserts: { newId: number; name: string; region: string }[] = [];
      const seen = new Set<number>();

      for (const row of srWs.getRows(2, srWs.rowCount) ?? []) {
        const oldId = row.getCell(1).value as number;
        const newId = row.getCell(2).value as number;
        const name = row.getCell(3).value as string;
        if (!oldId || !newId || !name) continue;
        if (seen.has(oldId)) {
          inserts.push({ newId, name, region: getRegion(name) });
        } else {
          seen.add(oldId);
          if (oldId !== newId) updates.push({ oldId, newId, name });
        }
      }

      log(`  ${updates.length} ID updates, ${inserts.length} new sub_regions`);

      for (const u of updates) {
        const exists = await db.execute(sql`SELECT id FROM sub_regions WHERE id = ${u.oldId}`);
        if ((exists as unknown as { rows: unknown[] }).rows?.length === 0) {
          log(`  ${u.name}: already updated, skipping`);
          continue;
        }
        await db.execute(sql`UPDATE sub_regions SET id = ${u.newId} WHERE id = ${u.oldId}`);
        await db.execute(sql`UPDATE data_entries SET subregion_id = ${u.newId} WHERE subregion_id = ${u.oldId}`);
        log(`  ${u.name}: id ${u.oldId} → ${u.newId}`);
      }

      for (const ins of inserts) {
        const exists = await db.execute(sql`SELECT id FROM sub_regions WHERE id = ${ins.newId}`);
        if ((exists as unknown as { rows: unknown[] }).rows?.length > 0) {
          await db.execute(sql`UPDATE sub_regions SET name = ${ins.name}, un_continental_region = ${ins.region} WHERE id = ${ins.newId}`);
          log(`  Existing id=${ins.newId} → "${ins.name}"`);
        } else {
          await db.execute(sql`INSERT INTO sub_regions (id, name, un_continental_region, is_active) VALUES (${ins.newId}, ${ins.name}, ${ins.region}, true)`);
          log(`  Inserted "${ins.name}" id=${ins.newId}`);
        }
      }

      await db.execute(sql`SELECT setval('sub_regions_id_seq', COALESCE((SELECT MAX(id) FROM sub_regions), 1))`);
    }

    log("\n[2] Updating countries sub_region_id → p2_subregion_id...");
    const cWs = wb.getWorksheet("p2_country");
    if (cWs) {
      let n = 0;
      for (const row of cWs.getRows(2, cWs.rowCount) ?? []) {
        const cid = row.getCell(1).value as number;
        const p2SubId = row.getCell(5).value as number;
        if (!cid || !p2SubId) continue;
        await db.execute(sql`UPDATE countries SET sub_region_id = ${p2SubId} WHERE id = ${cid}`);
        n++;
      }
      log(`  ${n} countries sub_region_id updated`);
    }

    log("\n[3] Updating countries IDs...");
    if (cWs) {
      const updates: { oldId: number; newId: number; name: string }[] = [];
      for (const row of cWs.getRows(2, cWs.rowCount) ?? []) {
        const oldId = row.getCell(1).value as number;
        const newId = row.getCell(2).value as number;
        const name = row.getCell(3).value as string;
        if (!oldId || !newId || !name) continue;
        if (oldId !== newId) updates.push({ oldId, newId, name });
      }

      log(`  ${updates.length} countries to update (two-phase)`);

      for (const u of updates) {
        const newIdExists = await db.execute(sql`SELECT id, name FROM countries WHERE id = ${u.newId}`);
        if ((newIdExists as unknown as { rows: Record<string, unknown>[] }).rows?.length > 0) {
          const row = (newIdExists as unknown as { rows: Record<string, unknown>[] }).rows[0];
          if (row.name === u.name) {
            log(`  ${u.name}: already at id ${u.newId}, skipping`);
            continue;
          }
        }
        
        const oldIdExists = await db.execute(sql`SELECT id FROM countries WHERE id = ${u.oldId}`);
        if ((oldIdExists as unknown as { rows: unknown[] }).rows?.length === 0) continue;
        
        const tempId = -u.oldId;
        await db.execute(sql`UPDATE organisations SET country_id = ${tempId} WHERE country_id = ${u.oldId}`);
        await db.execute(sql`UPDATE country_context SET country_id = ${tempId} WHERE country_id = ${u.oldId}`);
        await db.execute(sql`UPDATE data_entries SET country_id = ${tempId} WHERE country_id = ${u.oldId}`);
        await db.execute(sql`UPDATE countries SET id = ${tempId} WHERE id = ${u.oldId}`);
      }
      log(`  Phase 1: moved to temp IDs`);

      for (const u of updates) {
        const tempId = -u.oldId;
        const tempExists = await db.execute(sql`SELECT id FROM countries WHERE id = ${tempId}`);
        if ((tempExists as unknown as { rows: unknown[] }).rows?.length === 0) continue;
        
        const newIdExists = await db.execute(sql`SELECT id, name FROM countries WHERE id = ${u.newId}`);
        if ((newIdExists as unknown as { rows: Record<string, unknown>[] }).rows?.length > 0) {
          const row = (newIdExists as unknown as { rows: Record<string, unknown>[] }).rows[0];
          if (row.name === u.name) {
            log(`  ${u.name}: already at id ${u.newId}, cleaning up temp id ${tempId}`);
            await db.execute(sql`DELETE FROM countries WHERE id = ${tempId}`);
            continue;
          }
        }
        
        await db.execute(sql`UPDATE organisations SET country_id = ${u.newId} WHERE country_id = ${tempId}`);
        await db.execute(sql`UPDATE country_context SET country_id = ${u.newId} WHERE country_id = ${tempId}`);
        await db.execute(sql`UPDATE data_entries SET country_id = ${u.newId} WHERE country_id = ${tempId}`);
        await db.execute(sql`UPDATE countries SET id = ${u.newId} WHERE id = ${tempId}`);
        log(`  ${u.name}: id ${u.oldId} → ${u.newId}`);
      }
      log(`  Phase 2: moved to final p2_ids`);

      await db.execute(sql`SELECT setval('countries_id_seq', COALESCE((SELECT MAX(id) FROM countries), 1))`);
    }

    log("\n[4] Updating regions...");
    const rWs = wb.getWorksheet("p2_region");
    if (rWs) {
      const check = await db.execute(sql`SELECT to_regclass('regions')`);
      if (!(check as unknown as { rows: Array<{ to_regclass: string | null }> }).rows?.[0]?.to_regclass) {
        await db.execute(sql`CREATE TABLE regions (id integer PRIMARY KEY NOT NULL, name varchar(255) NOT NULL)`);
        log(`  Created regions table`);
      }
      for (const row of rWs.getRows(2, rWs.rowCount) ?? []) {
        const p2Id = row.getCell(2).value as number;
        const name = row.getCell(3).value as string;
        if (!p2Id || !name) continue;
        const exists = await db.execute(sql`SELECT id FROM regions WHERE id = ${p2Id}`);
        if ((exists as unknown as { rows: unknown[] }).rows?.length > 0) {
          await db.execute(sql`UPDATE regions SET name = ${name} WHERE id = ${p2Id}`);
        } else {
          await db.execute(sql`INSERT INTO regions (id, name) VALUES (${p2Id}, ${name})`);
          log(`  Inserted "${name}" id=${p2Id}`);
        }
      }
    }

    log("\n[4.5] Fixing utility_id references in service_areas, energy_resources, and power_stations...");
    
    const tablesToFix = [
      { table: "service_areas", nameColumn: "name" },
      { table: "energy_resources", nameColumn: "name" },
      { table: "power_stations", nameColumn: "name" },
    ];
    
    const countries = await db.execute(sql`SELECT id, name FROM countries`);
    const countryById = new Map((countries as unknown as { rows: Array<{ id: number; name: string }> }).rows.map((c) => [c.id, c.name] as const));
    
    const orgs = await db.execute(sql`SELECT id, name, country_id FROM organisations`);
    const orgByCountry = new Map<number, Array<{ id: number; name: string; country_id: number }>>();
    for (const org of (orgs as unknown as { rows: Array<{ id: number; name: string; country_id: number }> }).rows) {
      if (!orgByCountry.has(org.country_id)) {
        orgByCountry.set(org.country_id, []);
      }
      orgByCountry.get(org.country_id)!.push(org);
    }
    
    await db.execute(sql`SELECT setval('organisations_id_seq', COALESCE((SELECT MAX(id) FROM organisations), 1))`);
    
    for (const { table, nameColumn } of tablesToFix) {
      const invalidRows = await db.execute(sql`
        SELECT ${sql.raw(table)}.id, ${sql.raw(table)}.${sql.raw(nameColumn)} as name, ${sql.raw(table)}.utility_id 
        FROM ${sql.raw(table)}
        LEFT JOIN organisations o ON ${sql.raw(table)}.utility_id = o.id 
        WHERE o.id IS NULL
      `);
      
      if ((invalidRows as unknown as { rows: unknown[] }).rows.length > 0) {
        log(`  Found ${(invalidRows as unknown as { rows: unknown[] }).rows.length} invalid utility_ids in ${table}`);
        
        for (const row of (invalidRows as unknown as { rows: Array<{ id: number; name: string; utility_id: number }> }).rows) {
          const countryName = countryById.get(row.utility_id);
          if (!countryName) {
            log(`  SKIP: ${table} id=${row.id} (utility_id=${row.utility_id}) - no country with this id`);
            continue;
          }
          
          let orgs = orgByCountry.get(row.utility_id);
          if (!orgs || orgs.length === 0) {
            log(`  Creating organisation for ${countryName}...`);
            const newOrg = await db.execute(sql`
              INSERT INTO organisations (name, acronym, country_id, is_utility, is_active)
              VALUES (${countryName + ' Utility'}, ${countryName.substring(0, 3).toUpperCase() + 'U'}, ${row.utility_id}, true, true)
              RETURNING id
            `);
            const orgId = (newOrg as unknown as { rows: Array<{ id: number }> }).rows[0].id;
            orgByCountry.set(row.utility_id, [{ id: orgId, name: countryName + ' Utility', country_id: row.utility_id }]);
            orgs = orgByCountry.get(row.utility_id)!;
          }
          
          const org = orgs[0];
          await db.execute(sql`UPDATE ${sql.raw(table)} SET utility_id = ${org.id} WHERE id = ${row.id}`);
          log(`  FIXED: ${table} id=${row.id} (${row.name}) utility_id ${row.utility_id} → ${org.id}`);
        }
      } else {
        log(`  ${table}: no invalid utility_ids found`);
      }
    }

    log("\n[5] Recreating foreign key constraints...");
    for (const q of RECREATE_FKS) {
      await db.execute(q);
    }
    log(`  Recreated ${RECREATE_FKS.length} FK constraints`);

    log("\n=== ID update complete ===");
  } catch (e) {
    log("\n!!! ERROR — recreating FK constraints...");
    for (const q of RECREATE_FKS) {
      try { await db.execute(q); } catch { /* ignore if already exists */ }
    }
    log("  FK constraints recreated");
    throw e;
  }

  process.exit(0);
}

function getRegion(name: string): string {
  if (name.includes("Asia") || name.includes("South-Eastern")) return "Asia";
  if (name.includes("America") || name.includes("Northern")) return "Americas";
  return "Oceania";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
