import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const connString = process.env.DATABASE_URL;
if (!connString) {
    throw new Error('DATABASE_URL is not defined in environment variables');
}

const pool = new Pool({
    connectionString: connString,
    max: 45,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    query_timeout: 30000,
    idle_in_transaction_session_timeout: 60000,
});

export const db = drizzle(pool);