import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

const syncSql = `
  WITH latest_generation AS (
    SELECT DISTINCT ON (
      gr.report_period_id,
      gr.service_area_id,
      gr.input_def_id,
      gr.energy_provider_id,
      gr.energy_source_id
    )
      gr.report_period_id,
      gr.service_area_id,
      gr.input_def_id,
      gr.energy_provider_id,
      gr.energy_source_id,
      gr.is_relevant
    FROM generation_relevance gr
    WHERE gr.is_deleted = false
    ORDER BY
      gr.report_period_id,
      gr.service_area_id,
      gr.input_def_id,
      gr.energy_provider_id,
      gr.energy_source_id,
      gr.updated_at DESC,
      gr.id DESC
  ),
  latest_input AS (
    SELECT DISTINCT ON (ir.input_def_id, ir.dimension_id)
      ir.input_def_id,
      ir.dimension_id,
      ir.is_relevant
    FROM input_relevance ir
    ORDER BY ir.input_def_id, ir.dimension_id, ir.id DESC
  ),
  computed AS (
    SELECT
      de.id,
      (COALESCE(lg.is_relevant, true) AND COALESCE(li.is_relevant, true)) AS next_is_relevant
    FROM data_entries de
    LEFT JOIN latest_generation lg
      ON lg.report_period_id = de.report_period_id
      AND lg.service_area_id = de.service_area_id
      AND lg.input_def_id = de.input_def_id
      AND lg.energy_provider_id = de.energy_provider_id
      AND lg.energy_source_id = de.energy_source_id
    LEFT JOIN latest_input li
      ON li.input_def_id = de.input_def_id
      AND li.dimension_id = de.energy_source_id
    WHERE de.is_deleted = false
      AND de.energy_source_id IS NOT NULL
  ),
  updated AS (
    UPDATE data_entries de
    SET
      is_relevant = computed.next_is_relevant,
      updated_at = NOW()
    FROM computed
    WHERE de.id = computed.id
      AND de.is_relevant IS DISTINCT FROM computed.next_is_relevant
    RETURNING de.id
  )
  SELECT COUNT(*)::int AS updated_count
  FROM updated;
`;

async function main(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ updated_count: number }>(syncSql);
    const updatedCount = Number(result.rows?.[0]?.updated_count ?? 0);
    console.log(
      `Synced relevance into data_entries. Updated rows: ${updatedCount}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to sync relevance into data_entries", error);
  process.exit(1);
});
