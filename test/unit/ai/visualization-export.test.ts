import { describe, it, expect } from "vitest";
import {
  buildCsv,
  buildContextText,
  fmtNumber,
  rowsToCsv,
  slugifyTitle,
} from "@/lib/ai/visualization-export";

describe("fmtNumber", () => {
  it("formats finite numbers with up to two decimals", () => {
    expect(fmtNumber(1234.567)).toBe("1,234.57");
    expect(fmtNumber(50)).toBe("50");
  });

  it("returns a dash for non-numbers and non-finite values", () => {
    expect(fmtNumber(null)).toBe("-");
    expect(fmtNumber("12")).toBe("-");
    expect(fmtNumber(Number.NaN)).toBe("-");
    expect(fmtNumber(Infinity)).toBe("-");
  });
});

describe("slugifyTitle", () => {
  it("lowercases and kebab-cases titles", () => {
    expect(slugifyTitle("SAIDI by Utility", "chart")).toBe("saidi-by-utility");
  });

  it("falls back when the title has no usable characters", () => {
    expect(slugifyTitle("!!!", "chart")).toBe("chart");
  });
});

describe("buildCsv", () => {
  it("builds a header and rows, escaping commas, quotes and newlines", () => {
    const csv = buildCsv(
      ["Label", "Value"],
      [
        ["A", 1],
        ['B, "quoted"', 2],
        ["Multi\nline", 3],
        ["Empty", null],
      ],
    );
    expect(csv).toBe(
      'Label,Value\nA,1\n"B, ""quoted""",2\n"Multi\nline",3\nEmpty,',
    );
  });
});

describe("rowsToCsv", () => {
  it("flattens normalized rows into label + series columns", () => {
    const csv = rowsToCsv(
      [
        { label: "FY2022", "PNG Power Limited": 45, "Energy Fiji Limited": 20 },
        { label: "FY2023", "PNG Power Limited": 55, "Energy Fiji Limited": 24 },
      ],
      ["PNG Power Limited", "Energy Fiji Limited"],
    );
    expect(csv).toBe(
      "label,PNG Power Limited,Energy Fiji Limited\nFY2022,45,20\nFY2023,55,24",
    );
  });
});

describe("buildContextText", () => {
  it("prefixes the title and truncates overlong CSVs", () => {
    const body = Array.from({ length: 70 }, (_, i) => `r${i},${i}`).join("\n");
    const text = buildContextText("My Chart", body, 5);
    const lines = text.split("\n");
    expect(lines[0]).toBe("My Chart");
    expect(lines.length).toBe(8);
    expect(lines[7]).toBe("…(truncated)");
  });
});