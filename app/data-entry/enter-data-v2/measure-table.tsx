"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import {
  getDataTypeValidationMessage,
  getRangeOrPolarityValidationMessage,
  isValueValidForDataType,
} from "@/app/data-entry/enter-data/services/dataEntryValidation.service";
import {
  MeasureEntryRowView,
  MeasureEntryFilterContext,
} from "./types";
import {
  updateMeasureEntryValueAction,
  updateMeasureEntryAvailabilityAction,
} from "./service";

interface MeasureTableProps {
  rows: MeasureEntryRowView[];
  context: MeasureEntryFilterContext;
  applicableDimensions: string[];
}

const DIMENSION_COLUMNS: {
  key: keyof MeasureEntryRowView;
  idKey: keyof MeasureEntryRowView;
  label: string;
  dimName: string;
}[] = [
  {
    key: "energyProviderName",
    idKey: "energyProviderId",
    label: "Provider",
    dimName: "provider",
  },
  {
    key: "energyTypeName",
    idKey: "energyTypeId",
    label: "Type",
    dimName: "category",
  },
  {
    key: "energySourceName",
    idKey: "energySourceId",
    label: "Source",
    dimName: "technology",
  },
  {
    key: "customerTypeName",
    idKey: "customerTypeId",
    label: "Cust",
    dimName: "customer_type",
  },
  {
    key: "paymentModeName",
    idKey: "paymentModeId",
    label: "Pay",
    dimName: "payment_mode",
  },
  {
    key: "consumptionBandName",
    idKey: "consumptionBandId",
    label: "Band",
    dimName: "consumption_band",
  },
  {
    key: "divisionName",
    idKey: "divisionId",
    label: "Div",
    dimName: "division",
  },
  {
    key: "genderName",
    idKey: "genderId",
    label: "Gen",
    dimName: "gender",
  },
];

// Moves focus to the value input in the row directly above/below the one
// containing `el`, so entering many values in a column doesn't require
// reaching for the mouse between every cell.
function focusAdjacentValueInput(el: HTMLElement, direction: 1 | -1) {
  const currentRow = el.closest("tr");
  if (!currentRow) return;
  const targetRow = (
    direction === 1 ? currentRow.nextElementSibling : currentRow.previousElementSibling
  ) as HTMLElement | null;
  if (!targetRow) return;
  const nextInput = targetRow.querySelector<HTMLElement>("[data-value-input]");
  if (!nextInput) return;
  nextInput.focus();
  if (nextInput instanceof HTMLInputElement) nextInput.select();
}

export default function MeasureTable({
  rows,
  context,
  applicableDimensions,
}: MeasureTableProps) {
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [savingDnaRow, setSavingDnaRow] = useState<string | null>(null);
  const [errorByRow, setErrorByRow] = useState<Record<string, string>>({});

  const visibleDimensions = DIMENSION_COLUMNS.filter((d) =>
    applicableDimensions.includes(d.dimName),
  );

  const clearRowError = (rowKey: string) => {
    setErrorByRow((prev) => {
      if (!(rowKey in prev)) return prev;
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  const handleValueSave = async (row: MeasureEntryRowView, value: string) => {
    const rowKey = getRowKey(row);
    setSavingRow(rowKey);
    try {
      await updateMeasureEntryValueAction({
        dataEntryId: row.dataEntryId,
        measureId: row.measureId,
        energyProviderId: row.energyProviderId || 20,
        energyTypeId: row.energyTypeId || 30,
        energySourceId: row.energySourceId || 40,
        customerTypeId: row.customerTypeId || 690,
        paymentModeId: row.paymentModeId || 720,
        consumptionBandId: row.consumptionBandId || 0,
        divisionId: row.divisionId || 0,
        genderId: row.genderId || 0,
        unitId: row.unitId,
        valueNumeric:
          row.valueColumn === "value_numeric" ? Number(value) : undefined,
        valueBoolean:
          row.valueColumn === "value_boolean" ? value === "Yes" : undefined,
        valueOptionId:
          row.valueColumn === "value_option_id" ? Number(value) : undefined,
        valueString: row.valueColumn === "value_string" ? value : undefined,
      });
      // The server action already calls revalidatePath, which Next.js uses
      // to refresh this route's data as part of the action response — no
      // separate router.refresh() round trip needed (costly on slow links).
      clearRowError(rowKey);
      toast.success("Value saved.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save value.";
      setErrorByRow((prev) => ({ ...prev, [rowKey]: message }));
      toast.error(message);
    } finally {
      setSavingRow(null);
    }
  };

  const handleDnaToggle = async (row: MeasureEntryRowView, checked: boolean) => {
    const rowKey = getRowKey(row);
    setSavingDnaRow(rowKey);
    try {
      await updateMeasureEntryAvailabilityAction({
        dataEntryId: row.dataEntryId,
        measureId: row.measureId,
        energyProviderId: row.energyProviderId || 20,
        energyTypeId: row.energyTypeId || 30,
        energySourceId: row.energySourceId || 40,
        customerTypeId: row.customerTypeId || 690,
        paymentModeId: row.paymentModeId || 720,
        consumptionBandId: row.consumptionBandId || 0,
        divisionId: row.divisionId || 0,
        genderId: row.genderId || 0,
        unitId: row.unitId,
        isDataNotAvailable: checked,
      });
      clearRowError(rowKey);
      toast.success("Availability updated.");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to update availability.";
      setErrorByRow((prev) => ({ ...prev, [rowKey]: message }));
      toast.error(message);
    } finally {
      setSavingDnaRow(null);
    }
  };

  const getRowKey = (row: MeasureEntryRowView): string =>
    `${row.measureId}:${row.energyProviderId}:${row.energyTypeId}:${row.energySourceId}:${row.customerTypeId}:${row.paymentModeId}:${row.consumptionBandId}:${row.divisionId}:${row.genderId}:${row.unitId ?? "na"}`;

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        {context.reportPeriodId
          ? "No entries found for the selected filters."
          : "Select a report period to view data entries."}
      </div>
    );
  }

  const completeCount = rows.filter(
    (r) => r.displayValue != null || r.isDataNotAvailable,
  ).length;
  const requiredMissingCount = rows.filter(
    (r) => r.isMandatory && r.displayValue == null && !r.isDataNotAvailable,
  ).length;

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[200px]">
              Measure
            </th>
            {visibleDimensions.map((dim) => (
              <th
                key={dim.dimName}
                className="text-left px-2 py-2 font-medium text-muted-foreground whitespace-nowrap"
              >
                {dim.label}
              </th>
            ))}
            <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[120px]">
              Value
            </th>
            <th className="text-center px-2 py-2 font-medium text-muted-foreground w-[50px]">
              <abbr
                title="Data Not Available"
                className="no-underline decoration-dotted"
              >
                N/A
              </abbr>
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[180px]">
              Comments
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowKey = getRowKey(row);
            const isSaving = savingRow === rowKey;
            const isSavingDna = savingDnaRow === rowKey;
            const serverError = errorByRow[rowKey];
            return (
              <tr
                key={rowKey}
                className={`border-b hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}
              >
                <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                  <div className="font-medium truncate max-w-[200px]">
                    {row.measureName}
                    {row.isMandatory ? (
                      <span
                        className="text-danger ml-0.5"
                        aria-hidden="true"
                        title="Required"
                      >
                        *
                      </span>
                    ) : null}
                  </div>
                  {row.uomName ? (
                    <div className="text-xs text-muted-foreground">
                      {row.uomName}
                    </div>
                  ) : null}
                </td>
                {visibleDimensions.map((dim) => (
                  <td
                    key={dim.dimName}
                    className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap"
                  >
                    {String(row[dim.key] ?? "—")}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  {row.isDataNotAvailable ? (
                    <span className="inline-flex items-center gap-1 text-xs text-warning italic">
                      <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
                      Not Available
                    </span>
                  ) : (
                    <InputCell
                      row={row}
                      isSaving={isSaving}
                      serverError={serverError}
                      onSave={handleValueSave}
                      onDraftChange={() => clearRowError(rowKey)}
                    />
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="inline-flex items-center gap-1">
                    <Checkbox
                      checked={row.isDataNotAvailable}
                      disabled={isSavingDna}
                      onCheckedChange={(checked) =>
                        void handleDnaToggle(row, checked === true)
                      }
                      className="size-4"
                      aria-label={`Mark ${row.measureName} as data not available`}
                    />
                    {isSavingDna ? (
                      <Loader2
                        className="size-3 animate-spin shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2">
                  {row.comments ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="size-3" />
                      <span className="truncate max-w-[120px]">
                        {(() => {
                          try {
                            const parsed = JSON.parse(row.comments) as Array<{
                              comment: string;
                            }>;
                            return (
                              parsed.at(-1)?.comment?.slice(0, 40) ?? ""
                            );
                          } catch {
                            return "";
                          }
                        })()}
                      </span>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground flex items-center gap-3">
        <span>
          {rows.length} rows · {completeCount} complete
        </span>
        {requiredMissingCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-danger">
            <AlertCircle className="size-3" aria-hidden="true" />
            {requiredMissingCount} required{" "}
            {requiredMissingCount === 1 ? "value" : "values"} missing
          </span>
        ) : null}
      </div>
    </div>
  );
}

function InputCell({
  row,
  isSaving,
  serverError,
  onSave,
  onDraftChange,
}: {
  row: MeasureEntryRowView;
  isSaving: boolean;
  serverError: string | undefined;
  onSave: (row: MeasureEntryRowView, value: string) => void;
  onDraftChange: () => void;
}) {
  const [draft, setDraft] = useState(
    row.valueColumn === "value_option_id"
      ? String(row.valueOptionId ?? "")
      : (row.displayValue ?? ""),
  );

  // Live client-side validation — same pure rules the server enforces.
  const validationError = useMemo<string | null>(() => {
    if (draft.trim().length === 0) return null;
    if (!isValueValidForDataType(row.dataTypeName, draft)) {
      return getDataTypeValidationMessage({
        inputName: row.measureName,
        dataTypeName: row.dataTypeName,
      });
    }
    return getRangeOrPolarityValidationMessage(
      {
        inputName: row.measureName,
        isMandatory: row.isMandatory,
        dataTypeName: row.dataTypeName,
        isCurrency: row.isCurrency,
        validRangeMin: row.validRangeMin,
        validRangeMax: row.validRangeMax,
        validPolarityId: row.validPolarityId,
        validPolarityName: row.validPolarityName,
      },
      draft,
    );
  }, [draft, row]);

  const displayedError = validationError ?? serverError ?? null;

  const handleChange = (value: string) => {
    setDraft(value);
    onDraftChange();
  };

  const handleBlur = () => {
    if (validationError) return; // don't save an invalid value
    if (draft.trim() !== (row.displayValue ?? "")) {
      onSave(row, draft);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!validationError && draft.trim() !== (row.displayValue ?? "")) {
        onSave(row, draft);
      }
      focusAdjacentValueInput(e.currentTarget, 1);
    }
  };

  // Saved values get a neutral/success cue; empty required fields are
  // flagged — but never by colour alone (icon + text always pair with it),
  // and an empty optional field is not treated as an error.
  const fieldState: "error" | "saved" | "required" | "neutral" = displayedError
    ? "error"
    : row.displayValue
      ? "saved"
      : row.isMandatory
        ? "required"
        : "neutral";

  const borderClass = {
    error: "border-danger",
    saved: "border-success/40",
    required: "border-danger/40",
    neutral: "border-input",
  }[fieldState];

  const statusIcon = isSaving ? (
    <Loader2 className="size-3 animate-spin shrink-0" aria-hidden="true" />
  ) : fieldState === "saved" ? (
    <CheckCircle2 className="size-3 shrink-0 text-success" aria-hidden="true" />
  ) : fieldState === "required" ? (
    <span title="Required">
      <AlertCircle className="size-3 shrink-0 text-danger/70" aria-hidden="true" />
    </span>
  ) : null;

  const sharedInputClass = `h-8 w-28 text-xs ${borderClass} border-l-4 rounded-l-none`;
  const requiredHint = row.isMandatory ? (
    <span className="sr-only">Required</span>
  ) : null;

  switch (row.valueColumn) {
    case "value_numeric":
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="decimal"
              value={draft}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              aria-invalid={displayedError ? true : undefined}
              aria-required={row.isMandatory || undefined}
              data-value-input
              className={sharedInputClass}
              aria-label={`Value for ${row.measureName}${row.isMandatory ? " (required)" : ""}`}
            />
            {requiredHint}
            {statusIcon}
          </div>
          {displayedError ? (
            <p className="max-w-40 text-[11px] leading-tight text-danger flex items-start gap-0.5">
              <AlertCircle className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{displayedError}</span>
            </p>
          ) : null}
        </div>
      );
    case "value_boolean":
      return (
        <div className="flex items-center gap-1">
          <select
            value={draft}
            onChange={(e) => {
              handleChange(e.target.value);
              onSave(row, e.target.value);
            }}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            data-value-input
            className={`h-8 w-20 text-xs border rounded-md px-1 ${borderClass} border-l-4 rounded-l-none`}
            aria-label={`Boolean value for ${row.measureName}${row.isMandatory ? " (required)" : ""}`}
            aria-required={row.isMandatory || undefined}
          >
            <option value="">—</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
          {requiredHint}
          {statusIcon}
        </div>
      );
    case "value_option_id":
      return (
        <div className="flex items-center gap-1">
          <select
            value={draft}
            onChange={(e) => {
              handleChange(e.target.value);
              onSave(row, e.target.value);
            }}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            data-value-input
            className={`h-8 w-28 text-xs border rounded-md px-1 ${borderClass} border-l-4 rounded-l-none`}
            aria-label={`Value for ${row.measureName}${row.isMandatory ? " (required)" : ""}`}
            aria-required={row.isMandatory || undefined}
          >
            <option value="">—</option>
            {row.optionChoices.map((opt) => (
              <option key={opt.id} value={String(opt.id)}>
                {opt.name}
              </option>
            ))}
          </select>
          {requiredHint}
          {statusIcon}
        </div>
      );
    case "value_string":
    default:
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <Input
              type="text"
              value={draft}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              aria-invalid={displayedError ? true : undefined}
              aria-required={row.isMandatory || undefined}
              data-value-input
              className={sharedInputClass}
              aria-label={`Value for ${row.measureName}${row.isMandatory ? " (required)" : ""}`}
            />
            {requiredHint}
            {statusIcon}
          </div>
          {displayedError ? (
            <p className="max-w-40 text-[11px] leading-tight text-danger flex items-start gap-0.5">
              <AlertCircle className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{displayedError}</span>
            </p>
          ) : null}
        </div>
      );
  }
}
