import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

const populateSql = `
  WITH distinct_resource_combinations AS (
    SELECT DISTINCT
      er.type_id AS energy_resource_type_id,
      er.energy_type_id AS energy_type_id,
      er.energy_source_id AS energy_source_id
    FROM energy_resources er
    WHERE er.type_id IS NOT NULL
      AND er.energy_type_id IS NOT NULL
      AND er.energy_source_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO energy_resource_type_relevance (
      energy_resource_type_id,
      energy_type_id,
      energy_source_id
    )
    SELECT
      src.energy_resource_type_id,
      src.energy_type_id,
      src.energy_source_id
    FROM distinct_resource_combinations src
    LEFT JOIN energy_resource_type_relevance existing
      ON existing.energy_resource_type_id = src.energy_resource_type_id
     AND existing.energy_type_id = src.energy_type_id
     AND existing.energy_source_id = src.energy_source_id
    WHERE existing.id IS NULL
    RETURNING id
  )
  SELECT
    (SELECT COUNT(*)::int FROM distinct_resource_combinations) AS source_count,
    (SELECT COUNT(*)::int FROM inserted) AS inserted_count,
    (SELECT COUNT(*)::int FROM energy_resource_type_relevance) AS total_count;
`;

async function main(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{
      source_count: number;
      inserted_count: number;
      total_count: number;
    }>(populateSql);

    const row = result.rows[0];

    console.log(
      `Energy resource type relevance populated. Source combos: ${row?.source_count ?? 0}, inserted: ${row?.inserted_count ?? 0}, total rows: ${row?.total_count ?? 0}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to populate energy_resource_type_relevance:", error);
  process.exit(1);
});
