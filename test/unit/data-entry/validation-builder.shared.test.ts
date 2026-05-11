import { describe, expect, it } from "vitest";

import {
  defaultDevValidationBuilderConfig,
  sanitizeDevValidationBuilderConfig,
} from "@/app/data-entry/enter-data/services/validation-builder/shared";

describe("validation builder config sanitizer", () => {
  it("returns defaults when input is null", () => {
    expect(sanitizeDevValidationBuilderConfig(null)).toEqual(
      defaultDevValidationBuilderConfig,
    );
  });

  it("removes invalid codes and trims custom messages", () => {
    const sanitized = sanitizeDevValidationBuilderConfig({
      enabled: true,
      ruleToggles: {
        "required-value": true,
        "data-type": false,
        relevance: true,
        "range-polarity": true,
      },
      customMessages: {
        REQUIRED: "  Required override  ",
        INVALID_TYPE: " ",
      },
      dlDefExclusions: [
        {
          inputDefId: 42,
          codes: ["REQUIRED", "INVALID_TYPE", "NOT_A_CODE" as never],
        },
      ],
    });

    expect(sanitized.customMessages.REQUIRED).toBe("Required override");
    expect(sanitized.customMessages.INVALID_TYPE).toBeUndefined();
    expect(sanitized.dlDefExclusions).toEqual([
      {
        inputDefId: 42,
        codes: ["REQUIRED", "INVALID_TYPE"],
      },
    ]);
  });
});
