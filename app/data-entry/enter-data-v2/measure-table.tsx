"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
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

export default function MeasureTable({
  rows,
  context,
  applicableDimensions,
}: MeasureTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savingRow, setSavingRow] = useState<string | null>(null);

  const visibleDimensions = DIMENSION_COLUMNS.filter((d) =>
    applicableDimensions.includes(d.dimName),
  );

  const handleValueSave = (
    row: MeasureEntryRowView,
    value: string,
  ) => {
    setSavingRow(`${row.measureId}:${row.energySourceId}`);
    startTransition(() => {
      void (async () => {
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
              row.valueColumn === "value_numeric"
                ? Number(value)
                : undefined,
            valueBoolean:
              row.valueColumn === "value_boolean"
                ? value === "Yes"
                : undefined,
            valueOptionId:
              row.valueColumn === "value_option_id"
                ? Number(value)
                : undefined,
            valueString:
              row.valueColumn === "value_string" ? value : undefined,
          });
          router.refresh();
          toast.success("Value saved.");
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Failed to save value.",
          );
        } finally {
          setSavingRow(null);
        }
      })();
    });
  };

  const handleDnaToggle = (
    row: MeasureEntryRowView,
    checked: boolean,
  ) => {
    startTransition(() => {
      void (async () => {
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
          router.refresh();
          toast.success("Availability updated.");
        } catch {
          toast.error("Failed to update availability.");
        }
      })();
    });
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
              DNA
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[180px]">
              Comments
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowKey = getRowKey(row);
            const isSaving = savingRow === `${row.measureId}:${row.energySourceId}`;
            return (
              <tr
                key={rowKey}
                className={`border-b hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}
              >
                <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                  <div className="font-medium truncate max-w-[200px]">
                    {row.measureName}
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
                    <span className="text-xs text-amber-600 italic">
                      Not Available
                    </span>
                  ) : (
                    <InputCell
                      row={row}
                      isSaving={isPending || isSaving}
                      onSave={handleValueSave}
                    />
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <Checkbox
                    checked={row.isDataNotAvailable}
                    disabled={isPending}
                    onCheckedChange={(checked) =>
                      handleDnaToggle(row, checked === true)
                    }
                    className="size-4"
                    aria-label={`Data not available for ${row.measureName}`}
                  />
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
      <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        {rows.length} rows
        {" · "}
        {rows.filter((r) => r.displayValue != null || r.isDataNotAvailable)
          .length}{" "}
        complete
      </div>
    </div>
  );
}

function InputCell({
  row,
  isSaving,
  onSave,
}: {
  row: MeasureEntryRowView;
  isSaving: boolean;
  onSave: (row: MeasureEntryRowView, value: string) => void;
}) {
  const [draft, setDraft] = useState(row.displayValue ?? "");

  const handleBlur = () => {
    if (draft.trim() !== (row.displayValue ?? "")) {
      onSave(row, draft);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (draft.trim() !== (row.displayValue ?? "")) {
        onSave(row, draft);
      }
      (e.target as HTMLInputElement).blur();
    }
  };

  switch (row.valueColumn) {
    case "value_numeric":
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className={`h-8 w-28 text-xs ${row.displayValue ? "border-lime-300" : "border-red-100"} border-l-4 rounded-l-none`}
            aria-label={`Value for ${row.measureName}`}
          />
          {isSaving ? (
            <Loader2 className="size-3 animate-spin shrink-0" />
          ) : null}
        </div>
      );
    case "value_boolean":
      return (
        <div className="flex items-center gap-1">
          <select
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onSave(row, e.target.value);
            }}
            disabled={isSaving}
            className={`h-8 w-20 text-xs border rounded-md px-1 ${row.displayValue ? "border-lime-300" : "border-red-100"} border-l-4 rounded-l-none`}
            aria-label={`Boolean value for ${row.measureName}`}
          >
            <option value="">—</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
          {isSaving ? (
            <Loader2 className="size-3 animate-spin shrink-0" />
          ) : null}
        </div>
      );
    case "value_string":
    case "value_option_id":
    default:
      return (
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className={`h-8 w-28 text-xs ${row.displayValue ? "border-lime-300" : "border-red-100"} border-l-4 rounded-l-none`}
            aria-label={`Value for ${row.measureName}`}
          />
          {isSaving ? (
            <Loader2 className="size-3 animate-spin shrink-0" />
          ) : null}
        </div>
      );
  }
}
