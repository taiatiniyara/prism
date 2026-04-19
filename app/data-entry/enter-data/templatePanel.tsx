"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import readXlsxFile from "read-excel-file/browser";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  uploadDataEntryTemplateAction,
  type DataEntryTemplateUploadRowPayload,
} from "@/app/data-entry/enter-data/service";
import { DataEntryPageViewModel } from "@/app/data-entry/types";
import { Button } from "@/components/ui/button";

type TemplateRow = {
  context_mode: "flat" | "grouped-by-generator" | "grouped-by-payment-mode";
  input_def_id: number;
  input_name: string;
  unit_name: string;
  energy_resource_id: number | null;
  generator_name: string;
  payment_mode_id: number | null;
  payment_mode_name: string;
  customer_type_id: number | null;
  customer_type_name: string;
  value: string;
  is_data_not_available: "TRUE" | "FALSE";
};

interface EnterDataTemplatePanelProps {
  inputs: DataEntryPageViewModel["inputs"];
}

const SHEET_NAME = "Enter Data";

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const toNullableNumber = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
};

const toBooleanFlag = (value: unknown): boolean => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return (
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "1"
  );
};

const flattenTemplateRows = (
  inputs: DataEntryPageViewModel["inputs"],
): TemplateRow[] => {
  if (inputs.mode === "flat") {
    return inputs.rows.map((row) => ({
      context_mode: "flat",
      input_def_id: row.inputDefId,
      input_name: row.inputName,
      unit_name: row.unitName ?? "",
      energy_resource_id: row.energyResourceId ?? null,
      generator_name: "",
      payment_mode_id: row.paymentModeId ?? null,
      payment_mode_name: row.paymentModeName ?? "",
      customer_type_id: row.customerTypeId ?? null,
      customer_type_name: row.customerTypeName ?? "",
      value: row.value ?? "",
      is_data_not_available: row.isDataNotAvailable ? "TRUE" : "FALSE",
    }));
  }

  if (inputs.mode === "grouped-by-generator") {
    return inputs.groups.flatMap((group) =>
      group.rows.map((row) => ({
        context_mode: "grouped-by-generator",
        input_def_id: row.inputDefId,
        input_name: row.inputName,
        unit_name: row.unitName ?? "",
        energy_resource_id: row.energyResourceId ?? group.generatorId,
        generator_name: group.generatorName,
        payment_mode_id: row.paymentModeId ?? null,
        payment_mode_name: row.paymentModeName ?? "",
        customer_type_id: row.customerTypeId ?? null,
        customer_type_name: row.customerTypeName ?? "",
        value: row.value ?? "",
        is_data_not_available: row.isDataNotAvailable ? "TRUE" : "FALSE",
      })),
    );
  }

  return inputs.groups.flatMap((paymentModeGroup) =>
    paymentModeGroup.customerTypeGroups.flatMap((customerTypeGroup) =>
      customerTypeGroup.rows.map((row) => ({
        context_mode: "grouped-by-payment-mode",
        input_def_id: row.inputDefId,
        input_name: row.inputName,
        unit_name: row.unitName ?? "",
        energy_resource_id: row.energyResourceId ?? null,
        generator_name: "",
        payment_mode_id: row.paymentModeId ?? paymentModeGroup.paymentModeId,
        payment_mode_name:
          row.paymentModeName ?? paymentModeGroup.paymentModeName,
        customer_type_id:
          row.customerTypeId ?? customerTypeGroup.customerTypeId,
        customer_type_name:
          row.customerTypeName ?? customerTypeGroup.customerTypeName,
        value: row.value ?? "",
        is_data_not_available: row.isDataNotAvailable ? "TRUE" : "FALSE",
      })),
    ),
  );
};

export default function EnterDataTemplatePanel({
  inputs,
}: EnterDataTemplatePanelProps) {
  const router = useRouter();
  const [isUploading, startUploadTransition] = useTransition();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const templateRows = useMemo(() => flattenTemplateRows(inputs), [inputs]);

  const handleDownload = async () => {
    if (templateRows.length === 0) {
      toast.error("No visible rows are available to build a template.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(templateRows);

      XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);

      const output = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      const blob = new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "data-entry-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`Downloaded template with ${templateRows.length} row(s).`);
    } catch {
      toast.error("Unable to download the template.");
    }
  };

  const parseUploadRows = async (file: File) => {
    const [headerRow, ...dataRows] = await readXlsxFile(file, {
      sheet: SHEET_NAME,
    });

    if (!headerRow || headerRow.length === 0) {
      throw new Error("The selected worksheet is empty.");
    }

    const headers = headerRow.map(normalizeHeader);
    const requiredHeaders = [
      "input_def_id",
      "energy_resource_id",
      "payment_mode_id",
      "customer_type_id",
      "value",
      "is_data_not_available",
    ];

    for (const requiredHeader of requiredHeaders) {
      if (!headers.includes(requiredHeader)) {
        throw new Error(
          `Template is missing required column: ${requiredHeader}`,
        );
      }
    }

    const getCell = (row: unknown[], name: string) =>
      row[headers.indexOf(name)];

    return dataRows.map((row, index): DataEntryTemplateUploadRowPayload => {
      const inputDefId = toNullableNumber(getCell(row, "input_def_id"));
      if (inputDefId == null || inputDefId <= 0) {
        throw new Error(`Row ${index + 2} has an invalid input_def_id.`);
      }

      return {
        inputDefId,
        energyResourceId: toNullableNumber(getCell(row, "energy_resource_id")),
        paymentModeId: toNullableNumber(getCell(row, "payment_mode_id")),
        customerTypeId: toNullableNumber(getCell(row, "customer_type_id")),
        value: String(getCell(row, "value") ?? "").trim(),
        isDataNotAvailable: toBooleanFlag(
          getCell(row, "is_data_not_available"),
        ),
      };
    });
  };

  const handleSelectedFile = (file: File | null) => {
    setSelectedFileName(file?.name ?? null);

    if (!file) {
      return;
    }

    startUploadTransition(async () => {
      try {
        const rows = await parseUploadRows(file);
        const result = await uploadDataEntryTemplateAction(rows);
        toast.success(
          `Processed ${result.processed} row(s) and skipped ${result.skipped} empty row(s).`,
        );
        setSelectedFileName(null);
        router.refresh();
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to upload the template.",
        );
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5 xl:flex-nowrap">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) =>
          handleSelectedFile(event.target.files?.item(0) ?? null)
        }
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleDownload}
        className="text-xs"
        disabled={templateRows.length === 0 || isUploading}
      >
        <Download />
        Download Excel Template
      </Button>
      <Button
        type="button"
        variant="outline"
        className="text-xs"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={templateRows.length === 0 || isUploading}
      >
        <Upload />
        {isUploading ? "Uploading..." : "Upload Filled Template"}
      </Button>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {templateRows.length} row{templateRows.length === 1 ? "" : "s"}
        {selectedFileName ? ` · ${selectedFileName}` : ""}
      </span>
    </div>
  );
}
