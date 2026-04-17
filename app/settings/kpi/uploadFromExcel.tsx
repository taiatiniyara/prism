"use client";
import { ExcelKpiDefinition, UpdateKpiDefinitionFromExcel } from "./service";
import ExcelUploadForm from "@/components/settings/excel-upload-form";

export default function UploadKpiFromExcel() {
  return (
    <ExcelUploadForm
      title="Upload Inputs from Excel"
      sheetName="DCW2_KPI_Builder Updated"
      onUpload={async (rows) => {
        return UpdateKpiDefinitionFromExcel(
          rows as unknown as ExcelKpiDefinition[],
        );
      }}
    />
  );
}
