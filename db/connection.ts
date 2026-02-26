import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 100,
  connectionTimeoutMillis: 1000,
  idleTimeoutMillis: 30000,
  lock_timeout: 30000,
  idle_in_transaction_session_timeout: 30000,
  query_timeout: 30000,
  statement_timeout: 30000,
});

export const db = drizzle({ client: pool });
