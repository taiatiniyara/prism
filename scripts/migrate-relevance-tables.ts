/**
 * Migrates existing relevance data from data_entries to the new dedicated
 * tariff_relevance and transmission_relevance tables.
 *
 * Context: tariff/transmission relevance was previously smuggled into data_entries
 * rows (with value = NULL). This script extracts those rows into the proper tables
 * and removes them from data_entries.
 *
 * Idempotent — safe to run multiple times.
 *
 * Run: npx tsx scripts/migrate-relevance-tables.ts
 */
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  dataEntries,
  tariffRelevance,
  transmissionRelevance,
} from "@/db/schema/dataEntry";

async function main() {
  console.log("Starting relevance data migration...\n");

  // ── Create tables (if they don't exist) ───────────────────────────
  console.log("Ensuring tables exist...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tariff_relevance (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      report_period_id integer NOT NULL,
      service_area_id integer NOT NULL,
      input_def_id integer NOT NULL,
      payment_mode_id integer NOT NULL,
      customer_type_id integer NOT NULL,
      is_relevant boolean DEFAULT true NOT NULL,
      is_deleted boolean DEFAULT false NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL,
      "updatedById" text
    )
  `);
  console.log("  → tariff_relevance ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transmission_relevance (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      report_period_id integer NOT NULL,
      service_area_id integer NOT NULL,
      input_def_id integer NOT NULL,
      is_relevant boolean DEFAULT true NOT NULL,
      is_deleted boolean DEFAULT false NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL,
      "updatedById" text
    )
  `);
  console.log("  → transmission_relevance ready\n");

  // ── Tariff relevance ──────────────────────────────────────────────
  // data_entries rows with payment_mode + customer_type, no energy_resource
  const tariffRows = await db
    .select({
      id: dataEntries.id,
      report_period_id: dataEntries.report_period_id,
      service_area_id: dataEntries.service_area_id,
      input_def_id: dataEntries.input_def_id,
      payment_mode_id: dataEntries.payment_mode_id,
      customer_type_id: dataEntries.customer_type_id,
      is_relevant: dataEntries.is_relevant,
      is_deleted: dataEntries.is_deleted,
      updatedAt: dataEntries.updatedAt,
      updatedById: dataEntries.updatedById,
    })
    .from(dataEntries)
    .where(
      and(
        isNull(dataEntries.energy_resource_id),
        isNotNull(dataEntries.payment_mode_id),
        isNotNull(dataEntries.customer_type_id),
        isNotNull(dataEntries.service_area_id),
      ),
    );

  console.log(`Found ${tariffRows.length} tariff relevance rows in data_entries`);

  let tariffInserted = 0;
  for (const row of tariffRows) {
    await db.insert(tariffRelevance).values({
      report_period_id: row.report_period_id!,
      service_area_id: row.service_area_id!,
      input_def_id: row.input_def_id!,
      payment_mode_id: row.payment_mode_id!,
      customer_type_id: row.customer_type_id!,
      is_relevant: row.is_relevant,
      is_deleted: row.is_deleted,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    });
    tariffInserted += 1;
  }

  if (tariffRows.length > 0) {
    const tariffIds = tariffRows.map((r) => r.id);
    await db.delete(dataEntries).where(
      and(...tariffIds.map((id) => eq(dataEntries.id, id))),
    );
    console.log(`  → migrated ${tariffInserted} rows to tariff_relevance`);
    console.log(`  → deleted ${tariffRows.length} rows from data_entries\n`);
  } else {
    console.log("  → nothing to migrate\n");
  }

  // ── Transmission relevance ─────────────────────────────────────────
  // data_entries rows with no payment_mode, no customer_type, no energy_resource
  const transmissionRows = await db
    .select({
      id: dataEntries.id,
      report_period_id: dataEntries.report_period_id,
      service_area_id: dataEntries.service_area_id,
      input_def_id: dataEntries.input_def_id,
      is_relevant: dataEntries.is_relevant,
      is_deleted: dataEntries.is_deleted,
      updatedAt: dataEntries.updatedAt,
      updatedById: dataEntries.updatedById,
    })
    .from(dataEntries)
    .where(
      and(
        isNull(dataEntries.energy_resource_id),
        isNull(dataEntries.energy_provider_id),
        isNull(dataEntries.energy_source_id),
        isNull(dataEntries.payment_mode_id),
        isNull(dataEntries.customer_type_id),
        isNotNull(dataEntries.service_area_id),
      ),
    );

  console.log(`Found ${transmissionRows.length} transmission relevance rows in data_entries`);

  let transmissionInserted = 0;
  for (const row of transmissionRows) {
    await db.insert(transmissionRelevance).values({
      report_period_id: row.report_period_id!,
      service_area_id: row.service_area_id!,
      input_def_id: row.input_def_id!,
      is_relevant: row.is_relevant,
      is_deleted: row.is_deleted,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    });
    transmissionInserted += 1;
  }

  if (transmissionRows.length > 0) {
    const transmissionIds = transmissionRows.map((r) => r.id);
    await db.delete(dataEntries).where(
      and(...transmissionIds.map((id) => eq(dataEntries.id, id))),
    );
    console.log(`  → migrated ${transmissionInserted} rows to transmission_relevance`);
    console.log(`  → deleted ${transmissionRows.length} rows from data_entries\n`);
  } else {
    console.log("  → nothing to migrate\n");
  }

  // ── Drop old generation relevance tables ──────────────────────────
  console.log("Dropping old generation relevance tables...");

  await db.execute(sql`DROP TABLE IF EXISTS generation_relevance CASCADE`);
  console.log("  → dropped generation_relevance");

  await db.execute(sql`DROP TABLE IF EXISTS generation_toggle_relevance CASCADE`);
  console.log("  → dropped generation_toggle_relevance");

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
