"use client";
import {
  ExcelInputDefinition,
  UpdateInputDefinitionFromExcel,
} from "./service";
import ExcelUploadForm from "@/components/settings/excel-upload-form";

export default function UploadInputsFromExcel() {
  return (
    <ExcelUploadForm
      title="Upload Inputs from Excel"
      sheetName="Input Source"
      onUpload={async (rows) => {
        await UpdateInputDefinitionFromExcel(
          rows as unknown as ExcelInputDefinition[],
        );
        return {
          success: true,
          message: "Inputs updated successfully",
        };
      }}
    />
  );
}
