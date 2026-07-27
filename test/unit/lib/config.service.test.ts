import { describe, it, expect, beforeEach, vi } from "vitest";
import { getConfig } from "@/lib/config.service";

describe("config service", () => {
  beforeEach(() => {
    // Reset known env vars to clean state for testing
    for (const key of [...KNOWN_TEST_VARS]) {
      delete process.env[key];
    }
  });

  it("returns vars array with status and preview for known vars", () => {
    const result = getConfig();
    expect(result.vars.length).toBeGreaterThan(0);
    const dbUrl = result.vars.find((v) => v.key === "DATABASE_URL");
    expect(dbUrl).toBeDefined();
    expect(dbUrl!.status).toBe("unset");
  });

  it("marks set vars correctly and redacts secret values", () => {
    process.env.DATABASE_URL = "postgres://localhost/test";
    process.env.BETTER_AUTH_SECRET = "my-secret-key-12345";
    const result = getConfig();
    const dbUrl = result.vars.find((v) => v.key === "DATABASE_URL");
    expect(dbUrl!.status).toBe("set");
    expect(dbUrl!.preview).toBe("postgres://localhost/test");
    const secret = result.vars.find((v) => v.key === "BETTER_AUTH_SECRET");
    expect(secret!.preview).toBe("my-s...2345");
  });

  it("does not redact non-secret values", () => {
    process.env.POWERBI_WORKSPACE_NAME = "My Workspace";
    vi.stubEnv("NODE_ENV", "test");
    const result = getConfig();
    const ws = result.vars.find((v) => v.key === "POWERBI_WORKSPACE_NAME");
    expect(ws!.preview).toBe("My Workspace");
    const ne = result.vars.find((v) => v.key === "NODE_ENV");
    expect(ne!.preview).toBe("test");
  });

  it("derives feature flags from config", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.POWERBI_CLIENT_ID = "cid";
    process.env.POWERBI_CLIENT_SECRET = "cs";
    process.env.POWERBI_TENANT_ID = "tid";
    process.env.POWERBI_EMBED_URL = "https://pbi.test";
    process.env.POWERBI_WORKSPACE_ID = "wsid";
    process.env.POWERBI_DATASET_ID = "dsid";

    const result = getConfig();
    expect(result.flags.find((f) => f.name === "AI available")!.enabled).toBe(true);
    expect(result.flags.find((f) => f.name === "SMTP configured")!.enabled).toBe(true);
    expect(result.flags.find((f) => f.name === "Power BI enabled")!.enabled).toBe(true);
    expect(result.flags.find((f) => f.name === "Legacy training proxy enabled")!.enabled).toBe(false);
  });

  it("flags are false when config missing", () => {
    const result = getConfig();
    expect(result.flags.find((f) => f.name === "AI available")!.enabled).toBe(false);
    expect(result.flags.find((f) => f.name === "SMTP configured")!.enabled).toBe(false);
  });

  it("detects missing example vars", () => {
    const result = getConfig();
    expect(Array.isArray(result.missingFromExample)).toBe(true);
  });
});

// Vars we'll reset between tests — the ones the service checks
const KNOWN_TEST_VARS = [
  "DATABASE_URL", "BETTER_AUTH_SECRET", "ANTHROPIC_API_KEY",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS",
  "POWERBI_CLIENT_ID", "POWERBI_CLIENT_SECRET", "POWERBI_TENANT_ID",
  "POWERBI_EMBED_URL", "POWERBI_WORKSPACE_ID", "POWERBI_DATASET_ID",
  "POWERBI_WORKSPACE_NAME", "NODE_ENV",
  "PRISM_TRAINING_API_BASE_URL",
];
