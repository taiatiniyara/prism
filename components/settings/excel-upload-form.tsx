"use client";

import React from "react";
import readXlsxFile from "read-excel-file/browser";
import { toast } from "sonner";
import SubmitBtn from "@/components/submitBtn";
import { Input } from "@/components/ui/input";
import SettingsSection from "./settings-section";

interface UploadActionResponse {
  success?: boolean;
  message?: string;
}

interface ExcelUploadFormProps {
  title: string;
  sheetName: string;
  onUpload: (
    rows: Record<string, unknown>[],
  ) => Promise<UploadActionResponse | void>;
}

function rowsToObjects(rows: unknown[][]): Record<string, unknown>[] {
  const headers = (rows[0] as string[]) ?? [];
  return rows.slice(1).map((row) => {
    const rowData: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      rowData[header] = row[index];
    });
    return rowData;
  });
}

export default function ExcelUploadForm(props: ExcelUploadFormProps) {
  const [file, setFile] = React.useState<File | null>(null);

  return (
    <form
      action={async () => {
        if (!file) {
          toast.error("Please select a file to upload");
          return;
        }

        const rows = await readXlsxFile(file, { sheet: props.sheetName });
        if (!rows.length) {
          toast.error("The selected sheet has no data");
          return;
        }

        const response = await props.onUpload(rowsToObjects(rows));
        if (!response) {
          toast.success("Upload completed successfully");
          return;
        }

        if (response.success === false) {
          toast.error(response.message ?? "Upload failed");
          return;
        }

        toast.success(response.message ?? "Upload completed successfully");
      }}
      className="border m-4 w-fit bg-white p-4 rounded-lg space-y-3 shadow"
    >
      <SettingsSection title={props.title}>
        <Input
          onChange={(e) => setFile(e.target.files?.item(0) || null)}
          name="input_file"
          type="file"
        />
      </SettingsSection>

      <SubmitBtn text="Upload" />
    </form>
  );
}
