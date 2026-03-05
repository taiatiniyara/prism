"use client";
import readXlsxFile from "read-excel-file/browser";
import { UpdateInputDefinitionFromExcel } from "./service";
import SubmitBtn from "@/components/submitBtn";
import { Heading } from "@/components/heading";
import { toast } from "sonner";
import React from "react";
import { Input } from "@/components/ui/input";

export default function UploadInputsFromExcel() {
  const [file, setFile] = React.useState<File | null>(null);
  return (
    <form
      action={() => {
        if (file != null) {
          readXlsxFile(file, { sheet: "Input Source" }).then(async (rows) => {
            const headers = rows[0] as string[];
            const data: any[] = rows.slice(1).map((row) => {
              const rowData: Record<string, any> = {};
              headers.forEach((header, index) => {
                rowData[header] = row[index];
              });
              return rowData;
            });
            await UpdateInputDefinitionFromExcel(data);
            toast.success("Inputs updated successfully");
          });
        } else {
          toast.error("Please select a file to upload");
        }
      }}
      className="border m-4 w-fit bg-white p-4 rounded-lg space-y-3 shadow"
    >
      <Heading level={4}>Upload Inputs from Excel</Heading>
      <Input
        onChange={(e) => setFile(e.target.files?.item(0) || null)}
        name="input_file"
        type="file"
      />

      <SubmitBtn text="Upload" />
    </form>
  );
}
