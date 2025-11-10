import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
const url = process.env.NEXT_PUBLIC_DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

const pool = new Pool({
  connectionString: url,
});

export const db = drizzle(pool);

