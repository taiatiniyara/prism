"use client";

import { useState, useTransition } from "react";

import { DataEntryGeneratorGroupView } from "@/app/data-entry/types";
import { DataEntryStatusId } from "@/db/schema/dataEntry";
import { updateDataEntryAvailabilityAction } from "@/app/data-entry/enter-data/service";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";

const STATUS_ID_TO_LABEL: Record<number, string> = {
  [DataEntryStatusId.Pending]: "pending",
  [DataEntryStatusId.Entered]: "entered",
  [DataEntryStatusId.Not_Available]: "N/A",
};

interface GeneratorGroupsProps {
  groups: DataEntryGeneratorGroupView[];
  dataEntryStatusId: number | null;
}

export default function GeneratorGroups({
  groups,
  dataEntryStatusId,
}: GeneratorGroupsProps) {
  const [openGeneratorId, setOpenGeneratorId] = useState<number | null>(null);
  const [isMarkingAll, startMarkAllTransition] = useTransition();
  const selectedGroup = groups.find(
    (group) => group.generatorId === openGeneratorId,
  );

  const handleMarkAllNotAvailable = () => {
    if (!selectedGroup) return;

    startMarkAllTransition(() => {
      void (async () => {
        const pendingRows = selectedGroup.rows.filter((row) => {
          const hasValue = String(row.value ?? "").trim().length > 0;
          return !hasValue && !row.isDataNotAvailable;
        });

        if (pendingRows.length === 0) {
          toast.info("All inputs are already entered or marked as not available.");
          return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const row of pendingRows) {
          try {
            await updateDataEntryAvailabilityAction({
              inputDefId: row.inputDefId,
              energyResourceId: row.energyResourceId ?? null,
              customerTypeId: row.customerTypeId ?? null,
              paymentModeId: row.paymentModeId ?? null,
              isDataNotAvailable: true,
            });
            successCount += 1;
          } catch {
            failCount += 1;
          }
        }

        if (failCount === 0) {
          toast.success(
            `Marked ${successCount} input(s) as not available.`,
          );
        } else {
          toast.warning(
            `Marked ${successCount} as not available, ${failCount} failed.`,
          );
        }
      })();
    });
  };

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generator Groups</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          No non-virtual generators are available. Ensure generators have been
          configured under Settings &gt; Energy Resources and that generation
          relevance has been set under Settings &gt; Relevance.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {groups.map((group) => {
          const rowCount = group.rows.length;
          const pendingCount = group.rows.filter((row) => {
            const hasValue = String(row.value ?? "").trim().length > 0;
            return !hasValue && !row.isDataNotAvailable;
          }).length;

          const statusLabel =
            dataEntryStatusId != null
              ? STATUS_ID_TO_LABEL[dataEntryStatusId]
              : null;

          const badgeLabel =
            statusLabel != null
              ? `${rowCount} ${statusLabel}`
              : pendingCount > 0
                ? `${pendingCount} pending`
                : "Complete";

          const isPendingBadge =
            dataEntryStatusId != null
              ? dataEntryStatusId === DataEntryStatusId.Pending
              : pendingCount > 0;

          const isNaBadge =
            dataEntryStatusId === DataEntryStatusId.Not_Available;

          return (
            <button
              key={group.generatorId}
              type="button"
              className="w-full border shadow bg-white cursor-pointer rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
              onClick={() => setOpenGeneratorId(group.generatorId)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium leading-tight">
                  {group.generatorName}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isNaBadge
                      ? "bg-slate-100 text-slate-600"
                      : isPendingBadge
                        ? "bg-amber-100 text-amber-800"
                        : "bg-lime-100 text-lime-700"
                  }`}
                >
                  {badgeLabel}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {rowCount} input{rowCount === 1 ? "" : "s"} total
              </div>
            </button>
          );
        })}
      </div>

      <Dialog
        open={openGeneratorId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpenGeneratorId(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] w-[70vw] max-w-none! sm:max-w-none! overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup?.generatorName ?? "Generator"}
            </DialogTitle>
            <DialogDescription>
              Enter values for the selected generator inputs.
            </DialogDescription>
          </DialogHeader>
          {selectedGroup ? (
            <>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllNotAvailable}
                  disabled={isMarkingAll}
                  aria-label="Mark all pending inputs as not available"
                >
                  {isMarkingAll ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  ) : (
                    <Ban className="size-3.5 mr-1" />
                  )}
                  Mark All as Not Available
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-6 py-2 lg:grid-cols-2">
                {selectedGroup.rows.map((row) => (
                  <div
                    key={`${selectedGroup.generatorId}-${row.inputDefId}`}
                    className="space-y-1"
                  >
                    <div className="flex items-end justify-between">
                      <span className="text-sm font-semibold">
                        {row.inputName}
                      </span>
                      {row.unitName ? (
                        <span className="text-xs text-slate-500">
                          {row.unitName}
                        </span>
                      ) : null}
                    </div>
                    <InputCell
                      key={`${selectedGroup.generatorId}-${row.inputDefId}-${row.dataEntryId ?? "new"}-${row.updatedAt ?? "na"}-${row.isDataNotAvailable ? 1 : 0}`}
                      row={row}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
