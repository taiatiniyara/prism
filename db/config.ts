import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

export default defineConfig({
  out: "./db/migrations",
  schema: "./db/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
