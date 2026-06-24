import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    env: {
      BETTER_AUTH_SECRET: "test-auth-secret-for-vitest",
      BETTER_AUTH_URL: "http://localhost:3554",
      POWERBI_CLIENT_ID: "test-powerbi-client-id",
      POWERBI_CLIENT_SECRET: "test-powerbi-client-secret",
      POWERBI_TENANT_ID: "test-powerbi-tenant-id",
      POWERBI_WORKSPACE_ID: "test-powerbi-workspace-id",
      POWERBI_REPORT_ID: "test-powerbi-report-id",
      POWERBI_EMBED_URL: "https://test-powerbi.example.com",
      POWERBI_DATASET_ID: "test-powerbi-dataset-id",
      SMTP_HOST: "smtp.test.local",
      SMTP_PORT: "587",
      SMTP_USER: "test-user",
      SMTP_PASS: "test-pass",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
