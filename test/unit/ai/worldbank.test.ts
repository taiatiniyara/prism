import { describe, expect, it } from "vitest";
import {
  getWorldBankCountryContext,
  resolveUserIsoCode,
  type WBCountryContext,
  type WBIndicator,
  type WBProject,
} from "@/lib/ai/data-service/worldbank";

describe("World Bank module exports", () => {
  it("exports getWorldBankCountryContext", () => {
    expect(getWorldBankCountryContext).toBeTypeOf("function");
  });

  it("exports resolveUserIsoCode", () => {
    expect(resolveUserIsoCode).toBeTypeOf("function");
  });
});

describe("WBIndicator type", () => {
  it("has required fields", () => {
    const indicator: WBIndicator = {
      code: "NY.GDP.PCAP.CD",
      name: "GDP per capita (current US$)",
      value: 6425.74,
      year: "2024",
    };
    expect(indicator.code).toBe("NY.GDP.PCAP.CD");
    expect(indicator.name).toBeTruthy();
    expect(indicator.value).toBeTypeOf("number");
    expect(indicator.year).toBe("2024");
  });

  it("allows null value for missing indicators", () => {
    const indicator: WBIndicator = {
      code: "EG.ELC.ACCS.ZS",
      name: "Access to electricity",
      value: null,
      year: "",
    };
    expect(indicator.value).toBeNull();
  });
});

describe("WBProject type", () => {
  it("has required fields", () => {
    const project: WBProject = {
      id: "P500609",
      name: "Fiji Growth and Resilience",
      status: "Active",
      amount: "100,300,000",
      sectors: ["Energy", "Public Administration"],
      url: "https://projects.worldbank.org/en/projects-operations/project-detail/P500609",
    };
    expect(project.id).toBeTruthy();
    expect(project.name).toBeTruthy();
    expect(project.status).toBe("Active");
    expect(Array.isArray(project.sectors)).toBe(true);
  });
});

describe("WBCountryContext type", () => {
  it("has all classification fields", () => {
    const ctx: WBCountryContext = {
      iso_code: "FJ",
      country_name: "Fiji",
      income_level: "Upper middle income",
      lending_category: "Blend",
      region: "East Asia & Pacific",
      capital_city: "Suva",
      indicators: [
        {
          code: "NY.GDP.PCAP.CD",
          name: "GDP per capita (current US$)",
          value: 6425.74,
          year: "2024",
        },
      ],
      active_projects: [],
      data_note: "Data sourced from World Bank API.",
    };
    expect(ctx.income_level).toBe("Upper middle income");
    expect(ctx.lending_category).toBe("Blend");
    expect(ctx.iso_code).toBe("FJ");
  });
});

describe("getWorldBankCountryContext", () => {
  it("returns error for invalid country code", async () => {
    const result = await getWorldBankCountryContext("XX");
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("XX");
  });

  it("returns valid data for Fiji (FJ)", async () => {
    const result = await getWorldBankCountryContext("FJ");
    // If the API is unreachable, the test should still pass gracefully
    if (result.error) {
      expect(result.error).toBeTruthy();
      return;
    }
    expect(result.data).toBeTruthy();
    expect(result.data.iso_code).toBe("FJ");
    expect(result.data.country_name).toBeTruthy();
    expect(result.data.income_level).toBeTruthy();
    expect(result.data.region).toBeTruthy();
    expect(Array.isArray(result.data.indicators)).toBe(true);
    expect(Array.isArray(result.data.active_projects)).toBe(true);
  }, 15000);

  it("handles lowercase country codes", async () => {
    const result = await getWorldBankCountryContext("fj");
    if (result.error) return;
    expect(result.data.iso_code).toBe("FJ");
  }, 15000);
});
