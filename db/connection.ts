import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

declare global {
  var __prismPool: Pool | undefined;
}

const createPool = () =>
  new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.PG_POOL_MAX ?? "10"),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    lock_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });

const pool = globalThis.__prismPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismPool = pool;
}

export const db = drizzle({ client: pool });
