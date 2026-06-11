"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveAll, Loader2 } from "lucide-react";

import { DataEntryInputRowView } from "@/app/data-entry/types";
import { updateDataEntryValueAction } from "@/app/data-entry/enter-data/service";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InputRowsProps {
  rows: DataEntryInputRowView[];
  hasFilterSelection?: boolean;
  hasDefinitions?: boolean;
}

export default function InputRows({
  rows,
  hasFilterSelection = true,
  hasDefinitions = true,
}: InputRowsProps) {
  const router = useRouter();
  const [isSavingAll, startSaveAllTransition] = useTransition();

  const handleSaveAll = () => {
    startSaveAllTransition(() => {
      void (async () => {
        const pendingRows = rows.filter((row) => {
          const hasValue = String(row.value ?? "").trim().length > 0;
          return !hasValue && !row.isDataNotAvailable;
        });

        if (pendingRows.length === 0) {
          toast.info("All rows already have values or are marked as not available.");
          return;
        }

        let saved = 0;
        let failed = 0;

        for (const row of pendingRows) {
          if (!row.value || row.value.trim().length === 0) continue;
          try {
            await updateDataEntryValueAction({
              inputDefId: row.inputDefId,
              energyResourceId: row.energyResourceId ?? null,
              customerTypeId: row.customerTypeId ?? null,
              paymentModeId: row.paymentModeId ?? null,
              value: row.value,
            });
            saved += 1;
          } catch {
            failed += 1;
          }
        }

        if (saved > 0) {
          router.refresh();
        }

        if (failed === 0) {
          toast.success(`Saved ${saved} input(s).`);
        } else {
          toast.warning(`Saved ${saved}, ${failed} failed.`);
        }
      })();
    });
  };

  if (rows.length === 0) {
    let emptyReason: string;
    if (!hasFilterSelection) {
      emptyReason =
        "Please select a report period and subcategory above to view input rows.";
    } else if (!hasDefinitions) {
      emptyReason =
        "No input definitions have been configured for this subcategory. Run the migration from Settings > Migration, or create input definitions under Settings > Inputs.";
    } else {
      emptyReason =
        "All input definitions for this subcategory have been marked as not relevant. Check your relevance settings under Settings > Relevance.";
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Input Rows</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {emptyReason}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSaveAll}
          disabled={isSavingAll}
        >
          {isSavingAll ? (
            <Loader2 className="size-3.5 animate-spin mr-1" />
          ) : (
            <SaveAll className="size-3.5 mr-1" />
          )}
          Save All
        </Button>
      </div>
      <div className="grid lg:grid-cols-3 gap-6 sm:grid-cols-1 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.inputDefId}>
            <div className="flex justify-between items-end">
              <span className="font-semibold text-sm">{row.inputName}</span>
              {row.unitName ? (
                <span className="text-xs text-slate-500">{row.unitName}</span>
              ) : null}
            </div>
            <InputCell
              key={`${row.inputDefId}-${row.dataEntryId ?? "new"}-${row.updatedAt ?? "na"}-${row.isDataNotAvailable ? 1 : 0}`}
              row={row}
            />
          </div>
        ))}
      </div>
    </>
  );
}
