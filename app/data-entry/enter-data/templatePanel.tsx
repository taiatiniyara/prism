"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import readXlsxFile from "read-excel-file/browser";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  getTemplateInputsForDownloadAction,
  uploadDataEntryTemplateAction,
  type DataEntryTemplateUploadRowPayload,
} from "@/app/data-entry/enter-data/service";
import { DataEntryFilterContext } from "@/app/data-entry/constants";
import { DataEntryPageViewModel } from "@/app/data-entry/types";
import { shouldRunValidationBuilderRule } from "@/app/data-entry/enter-data/services/validation-builder/shared";
import { DevValidationBuilderConfig } from "@/app/data-entry/enter-data/services/validation-builder/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  data_type_name: string | null;
  is_mandatory: boolean;
  valid_range_min: number | null;
  valid_range_max: number | null;
  valid_polarity_id: number | null;
  valid_polarity_name: string | null;
  value: string;
  is_not_available: boolean;
  comments: string;
};

type TemplateRowLookupKey = {
  input_def_id: number;
  input_name: string;
  unit_name: string;
};

type DownloadTemplateScope = "subcategory" | "category";

interface EnterDataTemplatePanelProps {
  inputs: DataEntryPageViewModel["inputs"];
  context: DataEntryFilterContext;
  options: DataEntryPageViewModel["options"];
  builderConfig: DevValidationBuilderConfig | null;
}

const SHEET_NAME = "Enter Data";

const HEADER_DISPLAY_NAMES: Record<string, string> = {
  is_not_available: "Data Not Available (Select true if data is not available)",
};
const getDisplayHeader = (key: string): string =>
  HEADER_DISPLAY_NAMES[key] ?? key;

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeKeyText = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const createTemplateRowLookupKey = (value: TemplateRowLookupKey) =>
  [
    value.input_def_id,
    normalizeKeyText(value.input_name),
    normalizeKeyText(value.unit_name),
  ].join("|");

const getExcludedTemplateHeaders = (
  isGeneration: boolean,
): Set<keyof TemplateRow> => {
  const excluded = new Set<keyof TemplateRow>([
    "context_mode",
    "energy_resource_id",
    "payment_mode_id",
    "payment_mode_name",
    "customer_type_id",
    "customer_type_name",
    "data_type_name",
    "is_mandatory",
    "valid_range_min",
    "valid_range_max",
    "valid_polarity_id",
    "valid_polarity_name",
  ]);
  if (!isGeneration) {
    excluded.add("generator_name");
  }
  return excluded;
};

const normalizeTypeName = (typeName: string | null | undefined) =>
  (typeName ?? "").trim().toLowerCase();

const resolvePolarityRule = (
  validPolarityId: number | null,
  validPolarityName: string | null,
): "positive" | "negative" | "non-zero" | null => {
  if (validPolarityId === 130) {
    return "positive";
  }
  if (validPolarityId === 131) {
    return "negative";
  }
  if (validPolarityId === 132) {
    return "non-zero";
  }

  const normalized = normalizeTypeName(validPolarityName);
  if (normalized.includes("non-zero") || normalized.includes("non zero")) {
    return "non-zero";
  }
  if (normalized.includes("non-positive")) {
    return "negative";
  }
  if (normalized.includes("non-negative")) {
    return "positive";
  }
  if (normalized.includes("cannot be zero")) {
    return "non-zero";
  }
  if (normalized.includes("positive")) {
    return "positive";
  }
  if (normalized.includes("negative")) {
    return "negative";
  }

  return null;
};

const excelColumnLetter = (columnIndex: number): string => {
  let index = columnIndex;
  let letters = "";

  while (index > 0) {
    const remainder = (index - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    index = Math.floor((index - 1) / 26);
  }

  return letters;
};

const buildValueValidationFormula = (params: {
  valueRef: string;
  dnaRef: string;
  row: TemplateRow;
  builderConfig: DevValidationBuilderConfig | null;
}): string => {
  const conditions: string[] = [];
  const numericExpr = `VALUE(SUBSTITUTE(SUBSTITUTE(${params.valueRef}&"","$",""),",",""))`;

  // Keep parity with template upload handling: value and DNA cannot both be set.
  conditions.push(
    `OR(UPPER(TRIM(${params.dnaRef}&""))<>"TRUE",LEN(TRIM(${params.valueRef}&""))=0)`,
  );

  if (
    shouldRunValidationBuilderRule({
      config: params.builderConfig,
      ruleName: "required-value",
      code: "REQUIRED",
      inputDefId: params.row.input_def_id,
    }) &&
    params.row.is_mandatory
  ) {
    conditions.push(
      `OR(UPPER(TRIM(${params.dnaRef}&""))="TRUE",LEN(TRIM(${params.valueRef}&""))>0)`,
    );
  }

  if (
    shouldRunValidationBuilderRule({
      config: params.builderConfig,
      ruleName: "data-type",
      code: "INVALID_TYPE",
      inputDefId: params.row.input_def_id,
    })
  ) {
    const normalizedType = normalizeTypeName(params.row.data_type_name);

    if (
      normalizedType.includes("number") ||
      normalizedType.includes("decimal") ||
      normalizedType.includes("int")
    ) {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,NOT(ISERROR(${numericExpr})))`,
      );
    } else if (normalizedType.includes("bool")) {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISNUMBER(MATCH(LOWER(TRIM(${params.valueRef}&"")),{"true","false","yes","no","1","0"},0)))`,
      );
    } else if (normalizedType.includes("date")) {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISNUMBER(${params.valueRef}),NOT(ISERROR(DATEVALUE(${params.valueRef}&""))))`,
      );
    }
  }

  if (
    shouldRunValidationBuilderRule({
      config: params.builderConfig,
      ruleName: "range-polarity",
      code: "RANGE_OR_POLARITY",
      inputDefId: params.row.input_def_id,
    })
  ) {
    if (params.row.valid_range_min != null) {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISERROR(${numericExpr}),${numericExpr}>=${Number(params.row.valid_range_min)})`,
      );
    }

    if (params.row.valid_range_max != null) {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISERROR(${numericExpr}),${numericExpr}<=${Number(params.row.valid_range_max)})`,
      );
    }

    const polarityRule = resolvePolarityRule(
      params.row.valid_polarity_id,
      params.row.valid_polarity_name,
    );

    if (polarityRule === "positive") {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISERROR(${numericExpr}),${numericExpr}>=0)`,
      );
    }
    if (polarityRule === "negative") {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISERROR(${numericExpr}),${numericExpr}<=0)`,
      );
    }
    if (polarityRule === "non-zero") {
      conditions.push(
        `OR(LEN(TRIM(${params.valueRef}&""))=0,ISERROR(${numericExpr}),${numericExpr}<>0)`,
      );
    }
  }

  return `AND(${conditions.join(",")})`;
};

const toFilenameSegment = (
  value: string | null | undefined,
  fallback: string,
) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.length > 0 ? normalized : fallback;
};

const resolveOptionName = (
  options: Array<{ id: number; name: string }>,
  id: number | null,
): string | null => {
  if (id == null) {
    return null;
  }

  return options.find((option) => option.id === id)?.name ?? null;
};

type WorksheetCellStyle = {
  protection?: {
    locked?: boolean;
  };
};

const lockTemplateWorksheet = async (
  worksheet: import("exceljs").Worksheet,
  editableHeaders: string[],
) => {
  const editableColumns = new Set<number>();
  const headerRow = worksheet.getRow(1);

  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (editableHeaders.includes(normalizeHeader(cell.value))) {
      editableColumns.add(col);
    }
  });

  for (let row = 2; row <= worksheet.rowCount; row += 1) {
    for (const col of editableColumns) {
      const cell = worksheet.getRow(row).getCell(col);
      const existingProtection = (cell.style as WorksheetCellStyle).protection;

      cell.protection = {
        ...existingProtection,
        locked: false,
      };
    }
  }

  await worksheet.protect("prism-template", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: true,
    autoFilter: true,
    pivotTables: false,
    objects: false,
    scenarios: false,
  });
};

const applyBoldHeaderRow = (worksheet: import("exceljs").Worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = {
      ...(cell.font ?? {}),
      bold: true,
      color: { argb: "FF1F2937" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
};

const applyLeftAlignment = (worksheet: import("exceljs").Worksheet) => {
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = {
        ...(cell.alignment ?? {}),
        horizontal: "left",
      };
    });
  });
};

const freezeTopRow = (worksheet: import("exceljs").Worksheet) => {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
};

const applyHeaderFilter = (
  worksheet: import("exceljs").Worksheet,
  headerCount: number,
) => {
  if (headerCount <= 0) {
    return;
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headerCount },
  };
};

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
      context_mode: "flat" as const,
      input_def_id: row.inputDefId,
      input_name: row.inputName,
      unit_name: row.unitName ?? "",
      energy_resource_id: row.energyResourceId ?? null,
      generator_name: "",
      payment_mode_id: row.paymentModeId ?? null,
      payment_mode_name: row.paymentModeName ?? "",
      customer_type_id: row.customerTypeId ?? null,
      customer_type_name: row.customerTypeName ?? "",
      data_type_name: row.dataTypeName ?? null,
      is_mandatory: row.isMandatory ?? false,
      valid_range_min: row.validRangeMin ?? null,
      valid_range_max: row.validRangeMax ?? null,
      valid_polarity_id: row.validPolarityId ?? null,
      valid_polarity_name: row.validPolarityName ?? null,
      value: row.value ?? "",
      is_not_available: row.isDataNotAvailable ?? false,
      comments: row.comments ?? "",
    }));
  }

  if (inputs.mode === "grouped-by-generator") {
    return inputs.groups.flatMap((group) =>
      group.rows.map((row) => ({
        context_mode: "grouped-by-generator" as const,
        input_def_id: row.inputDefId,
        input_name: row.inputName,
        unit_name: row.unitName ?? "",
        energy_resource_id: row.energyResourceId ?? group.generatorId,
        generator_name: group.generatorName,
        payment_mode_id: row.paymentModeId ?? null,
        payment_mode_name: row.paymentModeName ?? "",
        customer_type_id: row.customerTypeId ?? null,
        customer_type_name: row.customerTypeName ?? "",
        data_type_name: row.dataTypeName ?? null,
        is_mandatory: row.isMandatory ?? false,
        valid_range_min: row.validRangeMin ?? null,
        valid_range_max: row.validRangeMax ?? null,
        valid_polarity_id: row.validPolarityId ?? null,
        valid_polarity_name: row.validPolarityName ?? null,
        value: row.value ?? "",
        is_not_available: row.isDataNotAvailable ?? false,
        comments: row.comments ?? "",
      })),
    );
  }

  return inputs.groups.flatMap((paymentModeGroup) =>
    paymentModeGroup.customerTypeGroups.flatMap((customerTypeGroup) =>
      customerTypeGroup.rows.map((row) => ({
        context_mode: "grouped-by-payment-mode" as const,
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
        data_type_name: row.dataTypeName ?? null,
        is_mandatory: row.isMandatory ?? false,
        valid_range_min: row.validRangeMin ?? null,
        valid_range_max: row.validRangeMax ?? null,
        valid_polarity_id: row.validPolarityId ?? null,
        valid_polarity_name: row.validPolarityName ?? null,
        value: row.value ?? "",
        is_not_available: row.isDataNotAvailable ?? false,
        comments: row.comments ?? "",
      })),
    ),
  );
};

export default function EnterDataTemplatePanel({
  inputs,
  context,
  options,
  builderConfig,
}: EnterDataTemplatePanelProps) {
  const router = useRouter();
  const [isUploading, startUploadTransition] = useTransition();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDownloadScopeDialogOpen, setIsDownloadScopeDialogOpen] =
    useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const templateRows = useMemo(() => flattenTemplateRows(inputs), [inputs]);
  const inputCategoryName = useMemo(
    () => resolveOptionName(options.inputCategories, context.inputCategoryId),
    [options.inputCategories, context.inputCategoryId],
  );
  const inputSubcategoryName = useMemo(
    () =>
      resolveOptionName(options.inputSubcategories, context.inputSubcategoryId),
    [options.inputSubcategories, context.inputSubcategoryId],
  );
  const buildDownloadFileName = (scope: DownloadTemplateScope) => {
    const inputCategoryName = resolveOptionName(
      options.inputCategories,
      context.inputCategoryId,
    );
    const inputSubcategoryName = resolveOptionName(
      options.inputSubcategories,
      scope === "category" ? null : context.inputSubcategoryId,
    );
    const reportPeriodName = resolveOptionName(
      options.reportPeriods,
      context.reportPeriodId,
    );

    return `prism_${toFilenameSegment(inputCategoryName, "all_inputcategory")}_${toFilenameSegment(inputSubcategoryName, "all_inputsubcategory")}_${toFilenameSegment(reportPeriodName, "all_reportperiod")}.xlsx`;
  };

  const handleDownload = async (scope: DownloadTemplateScope) => {
    const rowsForDownload =
      scope === "subcategory"
        ? templateRows
        : flattenTemplateRows(await getTemplateInputsForDownloadAction(scope));

    if (rowsForDownload.length === 0) {
      toast.error("No visible rows are available to build a template.");
      return;
    }

    const isGeneration =
      scope === "subcategory"
        ? context.inputSubcategoryId != null &&
          options.inputSubcategories.some(
            (sc) =>
              sc.id === context.inputSubcategoryId &&
              sc.name.trim().toLowerCase() === "generation",
          )
        : rowsForDownload.some((row) => row.generator_name.trim().length > 0);
    const excludedHeaders = getExcludedTemplateHeaders(isGeneration);

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(SHEET_NAME);
      const headers = Object.keys(rowsForDownload[0] ?? {}).filter(
        (header): header is keyof TemplateRow =>
          !excludedHeaders.has(header as keyof TemplateRow),
      );

      worksheet.addRow(headers.map(getDisplayHeader));
      applyBoldHeaderRow(worksheet);
      rowsForDownload.forEach((row) => {
        worksheet.addRow(
          headers.map((header) => row[header as keyof TemplateRow]),
        );
      });
      applyLeftAlignment(worksheet);
      freezeTopRow(worksheet);
      applyHeaderFilter(worksheet, headers.length);

      // Add TRUE/FALSE data validation dropdown to the is_not_available column.
      const valueColIndex = headers.indexOf("value");
      const dnaColIndex = headers.indexOf("is_not_available");
      if (dnaColIndex >= 0) {
        const dnaCol = dnaColIndex + 1; // ExcelJS columns are 1-based
        for (
          let rowIndex = 2;
          rowIndex <= rowsForDownload.length + 1;
          rowIndex += 1
        ) {
          worksheet.getCell(rowIndex, dnaCol).dataValidation = {
            type: "list",
            allowBlank: false,
            formulae: ['"TRUE,FALSE"'],
          };
        }
      }

      if (valueColIndex >= 0 && dnaColIndex >= 0) {
        const valueCol = valueColIndex + 1;
        const dnaCol = dnaColIndex + 1;

        for (
          let rowIndex = 2;
          rowIndex <= rowsForDownload.length + 1;
          rowIndex += 1
        ) {
          const row = rowsForDownload[rowIndex - 2];
          const valueRef = `${excelColumnLetter(valueCol)}${rowIndex}`;
          const dnaRef = `${excelColumnLetter(dnaCol)}${rowIndex}`;

          worksheet.getCell(rowIndex, valueCol).dataValidation = {
            type: "custom",
            allowBlank: true,
            showErrorMessage: true,
            errorStyle: "error",
            errorTitle: "Invalid data-entry value",
            error:
              "Value does not satisfy template validation rules for this input.",
            formulae: [
              buildValueValidationFormula({
                valueRef,
                dnaRef,
                row,
                builderConfig,
              }),
            ],
          };
        }
      }

      // Auto-size each column to fit the widest cell content.
      worksheet.columns.forEach((column) => {
        let maxLength = 10;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const cellLength = String(cell.value ?? "").length;
          if (cellLength > maxLength) {
            maxLength = cellLength;
          }
        });
        column.width = maxLength + 4;
      });

      await lockTemplateWorksheet(worksheet, [
        "value",
        normalizeHeader(getDisplayHeader("is_not_available")),
        "comments",
      ]);

      const output = await workbook.xlsx.writeBuffer();

      const blob = new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildDownloadFileName(scope);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(
        `Downloaded template with ${rowsForDownload.length} row(s).`,
      );
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

    const headers = headerRow.map(normalizeHeader).map((raw) => {
      for (const [internal, display] of Object.entries(HEADER_DISPLAY_NAMES)) {
        if (normalizeHeader(display) === raw) return internal;
      }
      return raw;
    });
    const requiredHeaders = [
      "input_def_id",
      "input_name",
      "unit_name",
      "value",
      "is_not_available",
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

    const templateRowLookup = new Map<string, TemplateRow[]>();
    templateRows.forEach((templateRow) => {
      const key = createTemplateRowLookupKey({
        input_def_id: templateRow.input_def_id,
        input_name: templateRow.input_name,
        unit_name: templateRow.unit_name,
      });

      const existing = templateRowLookup.get(key);
      if (existing) {
        existing.push(templateRow);
      } else {
        templateRowLookup.set(key, [templateRow]);
      }
    });

    return dataRows.map((row, index): DataEntryTemplateUploadRowPayload => {
      const inputDefId = toNullableNumber(getCell(row, "input_def_id"));
      if (inputDefId == null || inputDefId <= 0) {
        throw new Error(`Row ${index + 2} has an invalid input_def_id.`);
      }

      const rowLookupKey = createTemplateRowLookupKey({
        input_def_id: inputDefId,
        input_name: String(getCell(row, "input_name") ?? ""),
        unit_name: String(getCell(row, "unit_name") ?? ""),
      });

      const matchedRows = templateRowLookup.get(rowLookupKey);
      const matchedTemplateRow = matchedRows?.shift();

      if (!matchedTemplateRow) {
        throw new Error(
          `Row ${index + 2} does not match the active template context. Please download a fresh template and try again.`,
        );
      }

      const commentsIndex = headers.indexOf("comments");

      return {
        inputDefId,
        energyResourceId: matchedTemplateRow.energy_resource_id,
        paymentModeId: matchedTemplateRow.payment_mode_id,
        customerTypeId: matchedTemplateRow.customer_type_id,
        value: String(getCell(row, "value") ?? "").trim(),
        isDataNotAvailable: toBooleanFlag(getCell(row, "is_not_available")),
        comments:
          commentsIndex >= 0
            ? String(getCell(row, "comments") ?? "").trim()
            : "",
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
        onClick={() => setIsDownloadScopeDialogOpen(true)}
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

      <Dialog
        open={isDownloadScopeDialogOpen}
        onOpenChange={setIsDownloadScopeDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download template scope</DialogTitle>
            <DialogDescription>
              {`Download rows for
              ${inputSubcategoryName || "subcategory"}
              only or the whole of ${inputCategoryName || "category"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDownloadScopeDialogOpen(false);
                void handleDownload("subcategory");
              }}
            >
              <Download />{" "}
              {inputSubcategoryName ? `: ${inputSubcategoryName}` : " only"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsDownloadScopeDialogOpen(false);
                void handleDownload("category");
              }}
            >
              <Download /> {inputCategoryName ? `: ${inputCategoryName}` : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
