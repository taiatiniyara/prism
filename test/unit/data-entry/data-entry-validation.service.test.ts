import { describe, expect, it } from "vitest";

import {
  getDataTypeValidationMessage,
  getRangeOrPolarityValidationMessage,
  isValueValidForDataType,
  type DataEntryValidationMetadata,
} from "@/app/data-entry/enter-data/services/dataEntryValidation.service";

const baseMetadata: DataEntryValidationMetadata = {
  inputName: "Test Input",
  isMandatory: false,
  dataTypeName: "Number",
  isCurrency: false,
  validRangeMin: null,
  validRangeMax: null,
  validPolarityId: null,
  validPolarityName: null,
};

describe("data entry validation helpers", () => {
  it("validates numeric, boolean, and date data types", () => {
    expect(isValueValidForDataType("Number", "$1,200.50")).toBe(true);
    expect(isValueValidForDataType("Number", "not-a-number")).toBe(false);

    expect(isValueValidForDataType("Boolean", "Yes")).toBe(true);
    expect(isValueValidForDataType("Boolean", "0")).toBe(true);
    expect(isValueValidForDataType("Boolean", "maybe")).toBe(false);

    expect(isValueValidForDataType("Date", "2026-05-12")).toBe(true);
    expect(isValueValidForDataType("Date", "not-a-date")).toBe(false);
  });

  it("returns the expected data type error message", () => {
    expect(
      getDataTypeValidationMessage({
        inputName: "Revenue",
        dataTypeName: "Number",
      }),
    ).toBe("Revenue expects Number.");
  });

  it("enforces min/max numeric range", () => {
    const metadata: DataEntryValidationMetadata = {
      ...baseMetadata,
      inputName: "Revenue",
      validRangeMin: 10,
      validRangeMax: 100,
    };

    expect(getRangeOrPolarityValidationMessage(metadata, "9")).toBe(
      "Revenue must be greater than or equal to 10.",
    );
    expect(getRangeOrPolarityValidationMessage(metadata, "101")).toBe(
      "Revenue must be less than or equal to 100.",
    );
    expect(getRangeOrPolarityValidationMessage(metadata, "55")).toBeNull();
  });

  it("enforces polarity constraints", () => {
    const positiveOnly: DataEntryValidationMetadata = {
      ...baseMetadata,
      inputName: "Generation",
      validPolarityId: 130,
    };
    const negativeOnly: DataEntryValidationMetadata = {
      ...baseMetadata,
      inputName: "Variance",
      validPolarityId: 131,
    };
    const nonZeroOnly: DataEntryValidationMetadata = {
      ...baseMetadata,
      inputName: "Ratio",
      validPolarityId: 132,
    };

    expect(getRangeOrPolarityValidationMessage(positiveOnly, "-1")).toBe(
      "Generation cannot be negative.",
    );
    expect(getRangeOrPolarityValidationMessage(negativeOnly, "1")).toBe(
      "Variance cannot be positive.",
    );
    expect(getRangeOrPolarityValidationMessage(nonZeroOnly, "0")).toBe(
      "Ratio cannot be zero.",
    );
  });
});
