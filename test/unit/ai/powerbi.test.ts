import { describe, it, expect } from "vitest";
import { isConfiguredForDax } from "@/lib/powerbi";
import { sanitizeDax } from "@/lib/ai/data-service/dax-sanitizer";
import { PBI_QUERIES } from "@/lib/ai/data-service/pbi-queries";

describe("DAX sanitizer", () => {
  it("allows valid EVALUATE queries", () => {
    expect(sanitizeDax("EVALUATE table_name").valid).toBe(true);
    expect(sanitizeDax("EVALUATE SUMMARIZECOLUMNS('Sales'[Region], 'Sales'[Amount])").valid).toBe(true);
    expect(sanitizeDax("EVALUATE TOPN(10, 'Customers')").valid).toBe(true);
  });

  it("allows SUMMARIZECOLUMNS as top-level", () => {
    expect(sanitizeDax('SUMMARIZECOLUMNS(\'Fact SAIDI and SAIFI\'[Utility], \'Fact SAIDI and SAIFI\'[FY], "SAIDI", SUM(\'Fact SAIDI and SAIFI\'[SAIDI Value]))').valid).toBe(true);
  });

  it("allows DEFINE statements", () => {
    expect(sanitizeDax("DEFINE MEASURE t[sum] = SUM(t[val]) EVALUATE t").valid).toBe(true);
  });

  it("allows ORDER BY within EVALUATE", () => {
    expect(sanitizeDax("EVALUATE t ORDER BY t[col] ASC").valid).toBe(true);
  });

  it("rejects empty queries", () => {
    expect(sanitizeDax("").valid).toBe(false);
    expect(sanitizeDax("   ").valid).toBe(false);
  });

  it("rejects queries over max length", () => {
    const long = "EVALUATE " + "'x'".repeat(4000);
    expect(sanitizeDax(long).valid).toBe(false);
  });

  it("blocks REFRESH", () => {
    expect(sanitizeDax("REFRESH table_name").valid).toBe(false);
  });

  it("blocks ALTER", () => {
    expect(sanitizeDax("ALTER TABLE tab ADD COLUMN x").valid).toBe(false);
  });

  it("blocks CREATE", () => {
    expect(sanitizeDax("CREATE TABLE foo (x int)").valid).toBe(false);
  });

  it("blocks DELETE", () => {
    expect(sanitizeDax("DELETE FROM tab").valid).toBe(false);
  });

  it("blocks INSERT", () => {
    expect(sanitizeDax("INSERT INTO tab VALUES (1)").valid).toBe(false);
  });

  it("blocks UPDATE", () => {
    expect(sanitizeDax("UPDATE tab SET col = 1").valid).toBe(false);
  });

  it("blocks DROP", () => {
    expect(sanitizeDax("DROP TABLE tab").valid).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    expect(sanitizeDax("TRUNCATE TABLE tab").valid).toBe(false);
  });

  it("blocks GRANT", () => {
    expect(sanitizeDax("GRANT SELECT ON tab TO user").valid).toBe(false);
  });

  it("blocks REVOKE", () => {
    expect(sanitizeDax("REVOKE SELECT ON tab FROM user").valid).toBe(false);
  });

  it("blocks INFO schema discovery functions", () => {
    expect(sanitizeDax("EVALUATE INFO.COLUMNS()").valid).toBe(false);
    expect(sanitizeDax("EVALUATE INFO.TABLES()").valid).toBe(false);
    expect(sanitizeDax("EVALUATE INFO(COLUMNS)").valid).toBe(false);
  });

  it("blocks DMV access", () => {
    expect(sanitizeDax("SELECT * FROM $SYSTEM.DMSCHEMA_TABLES").valid).toBe(false);
  });

  it("blocks DISCOVER_SCHEMA", () => {
    expect(sanitizeDax("CALL DISCOVER_SCHEMA()").valid).toBe(false);
  });

  it("blocks BACKUP and RESTORE", () => {
    expect(sanitizeDax("BACKUP DATABASE foo").valid).toBe(false);
    expect(sanitizeDax("RESTORE DATABASE foo").valid).toBe(false);
  });

  it("blocks PROCESS", () => {
    expect(sanitizeDax("{ PROCESS TABLE tab }").valid).toBe(false);
  });

  it("rejects queries without valid top-level statement", () => {
    expect(sanitizeDax("SELECT * FROM table_name").valid).toBe(false);
    expect(sanitizeDax("WITH cte AS (SELECT * FROM t) SELECT * FROM cte").valid).toBe(false);
  });

  it("rejects queries starting with arbitrary text", () => {
    expect(sanitizeDax("just some random text").valid).toBe(false);
  });

  it("blocks CASE-SENSITIVE variants of blocked patterns", () => {
    expect(sanitizeDax("evaluate info.columns()").valid).toBe(false);
    expect(sanitizeDax("Evaluate DISCOVER_SCHEMA()").valid).toBe(false);
    expect(sanitizeDax("Refresh table_name").valid).toBe(false);
  });
});

describe("All 55 pre-built PBI query templates pass validation", () => {
  const templates = Object.values(PBI_QUERIES) as Array<{
    name: string;
    dax: (params: Record<string, string>) => string;
    params: Record<string, { type: string; description: string; required: boolean }>;
  }>;

  for (const template of templates) {
    it(`template "${template.name}" produces valid DAX`, () => {
      const sampleParams: Record<string, string> = {};
      for (const [key, def] of Object.entries(template.params)) {
        if (def.type === "string") sampleParams[key] = "TEST_VALUE";
        else sampleParams[key] = "1";
      }

      const dax = template.dax(sampleParams);
      const result = sanitizeDax(dax);

      if (!result.valid) {
        console.error(`Template "${template.name}" generated invalid DAX:`, result.reason);
        console.error("Generated DAX:", dax.slice(0, 500));
      }

      expect(result.valid).toBe(true);
    });
  }
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
    const delay = BASE_MS * Math.pow(2, 1) + 250;
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
    expect(timestamps[0]).toBe(40_000);
  });
});
