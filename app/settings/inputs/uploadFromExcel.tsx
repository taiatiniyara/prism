"use client";
import {
  ExcelMeasureDefinition,
  UpdateMeasureDefinitionFromExcel,
} from "./service";
import ExcelUploadForm from "@/components/settings/excel-upload-form";

function parseExcelInputRow(row: Record<string, unknown>): ExcelMeasureDefinition {
  return {
    agg_level_id: Number(row.agg_level_id ?? 0),
    data_type_id: Number(row.data_type_id ?? 0),
    description: String(row.description ?? ""),
    input_category_id: Number(row.input_category_id ?? 0),
    input_id: Number(row.input_id ?? 0),
    input_subcategory_id: Number(row.input_subcategory_id ?? 0),
    is_active: Boolean(row.is_active),
    is_aggregated: Boolean(row.is_aggregated),
    is_calculated: Boolean(row.is_calculated),
    is_currency: Boolean(row.is_currency),
    is_descriptive: Boolean(row.is_descriptive),
    is_kpi: Boolean(row.is_kpi),
    is_kpi_input: Boolean(row.is_kpi_input),
    is_mandatory: Boolean(row.is_mandatory),
    is_system_generated: Boolean(row.is_system_generated),
    name: String(row.name ?? ""),
    service_relevance_group_id: Number(row.service_relevance_group_id ?? 0),
    unit_id: Number(row.unit_id ?? 0),
    utility_service_id: Number(row.utility_service_id ?? 0),
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
