import { defineConfig } from "drizzle-kit";

const url = process.env.NEXT_PUBLIC_DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
