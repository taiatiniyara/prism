"use client";
import {
  ExcelMeasureDefinition,
  UpdateMeasureDefinitionFromExcel,
} from "./service";
import ExcelUploadForm from "@/components/settings/excel-upload-form";

function parseExcelInputRow(row: Record<string, unknown>): ExcelMeasureDefinition {
  return {
    strata_id: Number(row.strata_id ?? 0),
    data_type_id: Number(row.data_type_id ?? 0),
    input_category_id: Number(row.input_category_id ?? 0),
    input_id: Number(row.input_id ?? 0),
    input_subcategory_id: Number(row.input_subcategory_id ?? 0),
    is_active: Boolean(row.is_active),
    is_calculated: Boolean(row.is_calculated),
    is_currency: Boolean(row.is_currency),
    is_mandatory: Boolean(row.is_mandatory),
    is_system_generated: Boolean(row.is_system_generated),
    name: String(row.name ?? ""),
    unit_id: Number(row.unit_id ?? 0),
    valid_polarity_id: Number(row.valid_polarity_id ?? 0),
    valid_range_max: Number(row.valid_range_max ?? 0),
    valid_range_min: Number(row.valid_range_min ?? 0),
    valid_trend_id: Number(row.valid_trend_id ?? 0),
    variable_name: String(row.variable_name ?? ""),
  };
}

export default function UploadInputsFromExcel() {
  return (
    <ExcelUploadForm
      title="Upload Inputs from Excel"
      sheetName="Input Source"
      onUpload={async (rows) => {
        await UpdateMeasureDefinitionFromExcel(rows.map(parseExcelInputRow));
        return {
          success: true,
          message: "Inputs updated successfully",
        };
      }}
    />
  );
}
