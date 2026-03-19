import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

const statements = [
  {
    label: "data_entry_feedbacks.feedback_date",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'data_entry_feedbacks'
            AND column_name = 'feedback_date'
            AND data_type = 'uuid'
        ) THEN
          ALTER TABLE public.data_entry_feedbacks
          ALTER COLUMN feedback_date TYPE timestamp without time zone
          USING CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `,
  },
  {
    label: "data_entry_feedbacks.reply_date",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'data_entry_feedbacks'
            AND column_name = 'reply_date'
            AND data_type = 'uuid'
        ) THEN
          ALTER TABLE public.data_entry_feedbacks
          ALTER COLUMN reply_date TYPE timestamp without time zone
          USING NULL::timestamp without time zone;
        END IF;
      END $$;
    `,
  },
  {
    label: "data_entry_logs.updated_at",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'data_entry_logs'
            AND column_name = 'updated_at'
            AND data_type = 'uuid'
        ) THEN
          ALTER TABLE public.data_entry_logs
          ALTER COLUMN updated_at TYPE timestamp without time zone
          USING CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `,
  },
] as const;

async function main(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const step of statements) {
      await client.query(step.sql);
      console.log(`Applied: ${step.label}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to apply UUID to timestamp fix:", error);
  process.exit(1);
});
