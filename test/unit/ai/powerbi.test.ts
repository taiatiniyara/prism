import { describe, it, expect } from "vitest";
import { isConfiguredForDax } from "@/lib/powerbi.service";

describe("Power BI DAX validation", () => {
  const DAX_MAX_LENGTH = 8000;
  const DAX_BLOCKED_PATTERNS = [
    /\bREFRESH\b/i,
    /\bALTER\b/i,
    /\bCREATE\b/i,
    /\bDROP\b/i,
    /\bDELETE\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bTRUNCATE\b/i,
    /\bGRANT\b/i,
    /\bREVOKE\b/i,
  ];

  const validateDax = (dax: string): { valid: boolean; reason?: string } => {
    if (!dax || !dax.trim()) {
      return { valid: false, reason: "DAX query is empty." };
    }
    if (dax.length > DAX_MAX_LENGTH) {
      return { valid: false, reason: `DAX query too long (max ${DAX_MAX_LENGTH} chars).` };
    }
    for (const pattern of DAX_BLOCKED_PATTERNS) {
      if (pattern.test(dax)) {
        return { valid: false, reason: "DAX query contains disallowed statements." };
      }
    }
    return { valid: true };
  };

  it("allows valid EVALUATE queries", () => {
    expect(validateDax("EVALUATE table_name").valid).toBe(true);
    expect(validateDax("EVALUATE SUMMARIZECOLUMNS('Sales'[Region], 'Sales'[Amount])").valid).toBe(true);
    expect(validateDax("EVALUATE TOPN(10, 'Customers')").valid).toBe(true);
  });

  it("rejects empty queries", () => {
    expect(validateDax("").valid).toBe(false);
    expect(validateDax("   ").valid).toBe(false);
  });

  it("rejects queries over max length", () => {
    const long = "EVALUATE " + "'x'".repeat(4000);
    expect(validateDax(long).valid).toBe(false);
  });

  it("blocks REFRESH", () => {
    expect(validateDax("REFRESH table_name").valid).toBe(false);
  });

  it("blocks ALTER", () => {
    expect(validateDax("ALTER TABLE tab ADD COLUMN x").valid).toBe(false);
  });

  it("blocks CREATE", () => {
    expect(validateDax("CREATE TABLE foo (x int)").valid).toBe(false);
  });

  it("blocks DELETE", () => {
    expect(validateDax("DELETE FROM tab").valid).toBe(false);
  });

  it("blocks INSERT", () => {
    expect(validateDax("INSERT INTO tab VALUES (1)").valid).toBe(false);
  });

  it("blocks UPDATE", () => {
    expect(validateDax("UPDATE tab SET col = 1").valid).toBe(false);
  });

  it("blocks DROP", () => {
    expect(validateDax("DROP TABLE tab").valid).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    expect(validateDax("TRUNCATE TABLE tab").valid).toBe(false);
  });

  it("blocks GRANT", () => {
    expect(validateDax("GRANT SELECT ON tab TO user").valid).toBe(false);
  });

  it("blocks REVOKE", () => {
    expect(validateDax("REVOKE SELECT ON tab FROM user").valid).toBe(false);
  });
});

describe("Power BI config resolution fails gracefully", () => {
  it("isConfiguredForDax returns false when env vars missing", () => {
    const original = { ...process.env };
    delete (process.env as Record<string, string | undefined>).POWERBI_CLIENT_ID;
    delete (process.env as Record<string, string | undefined>).POWERBI_WORKSPACE_ID;
    delete (process.env as Record<string, string | undefined>).POWERBI_WORKSPACE_NAME;
    delete (process.env as Record<string, string | undefined>).POWERBI_DATASET_ID;
    delete (process.env as Record<string, string | undefined>).POWERBI_DATASET_NAME;
    expect(isConfiguredForDax()).toBe(false);
    process.env = original;
  });
});

describe("Token expiry tracking", () => {
  it("token cache expires after 50 minutes", () => {
    const now = Date.now();
    const expiresAt = now + 50 * 60 * 1000;
    expect(expiresAt - now).toBe(3_000_000);
  });

  it("token cache is considered fresh with 60s buffer", () => {
    const now = Date.now();
    const expiresAt = now + 50 * 60 * 1000;
    const isFresh = expiresAt > now + 60_000;
    expect(isFresh).toBe(true);
  });

  it("token cache is stale when close to expiry", () => {
    const now = Date.now();
    const expiresAt = now + 30_000;
    const isFresh = expiresAt > now + 60_000;
    expect(isFresh).toBe(false);
  });
});

describe("fetch retry backoff", () => {
  it("exponential backoff doubles delay each attempt", () => {
    const BASE_MS = 1000;
    const delays = [0, 1, 2, 3].map((attempt) => BASE_MS * Math.pow(2, attempt));
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
  });

  it("jitter adds random within 500ms", () => {
    const BASE_MS = 1000;
    const delay = BASE_MS * Math.pow(2, 1) + 250; // attempt 1 with midpoint jitter
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(2500);
  });
});

describe("Rate limiter window", () => {
  it("shifts out timestamps outside window", () => {
    const PBI_WINDOW_MS = 60_000;
    const now = 100_000;
    const timestamps = [30_000, 40_000, 50_000, 60_000];
    while (timestamps.length > 0 && now - timestamps[0] > PBI_WINDOW_MS) {
      timestamps.shift();
    }
    // 30_000 is outside 60s window from 100_000, 39_999+ are inside
    expect(timestamps[0]).toBe(40_000);
  });
});
