import { defineConfig } from 'drizzle-kit';

const connString = process.env.DATABASE_URL;
if (!connString) {
    throw new Error('DATABASE_URL is not defined in environment variables');
}

export default defineConfig({
    out: './lib/db/migrations',
    schema: './src/db/schema/*.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: connString,
    },
});
