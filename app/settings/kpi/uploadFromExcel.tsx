"use client";
import { ExcelKpiDefinition, UpdateKpiDefinitionFromExcel } from "./service";
import ExcelUploadForm from "@/components/settings/excel-upload-form";

function parseExcelKpiRow(row: Record<string, unknown>): ExcelKpiDefinition {
  return {
    source_id: Number(row.source_id ?? 0),
    formula: String(row.formula ?? ""),
    kpi_category_id: Number(row.kpi_category_id ?? 0),
    kpi_subcategory_id: Number(row.kpi_subcategory_id ?? 0),
    kpi_name: String(row.kpi_name ?? ""),
    kpi_unit_id: Number(row.kpi_unit_id ?? 0),
    kpi_block: Number(row.kpi_block ?? 0),
    kpi_agglevel_id: Number(row.kpi_agglevel_id ?? 0),
    is_kpi_input: Boolean(row.is_kpi_input),
    kpi_type_id: Number(row.kpi_type_id ?? 0),
    is_currency: Boolean(row.is_currency),
    is_descriptive: Boolean(row.is_descriptive),
    is_active: Boolean(row.is_active),
  };
}

export default function UploadKpiFromExcel() {
  return (
    <ExcelUploadForm
      title="Upload Inputs from Excel"
      sheetName="DCW2_KPI_Builder Updated"
      onUpload={async (rows) => {
        return UpdateKpiDefinitionFromExcel(rows.map(parseExcelKpiRow));
      }}
    />
  );
}
