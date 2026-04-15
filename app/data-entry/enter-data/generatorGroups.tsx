"use client";

import { useState } from "react";

import { DataEntryGeneratorGroupView } from "@/app/data-entry/types";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GeneratorGroupsProps {
  groups: DataEntryGeneratorGroupView[];
}
``;

export default function GeneratorGroups({ groups }: GeneratorGroupsProps) {
  const [openGeneratorId, setOpenGeneratorId] = useState<number | null>(null);
  const selectedGroup = groups.find(
    (group) => group.generatorId === openGeneratorId,
  );

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generator Groups</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          No non-virtual generators are available for the selected service area.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {groups.map((group) => {
          const pendingCount = group.rows.filter((row) => {
            const hasValue = String(row.value ?? "").trim().length > 0;
            return !hasValue && !row.isDataNotAvailable;
          }).length;

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
                    pendingCount > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-lime-100 text-lime-700"
                  }`}
                >
                  {pendingCount > 0 ? `${pendingCount} pending` : "Complete"}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {group.rows.length} input{group.rows.length === 1 ? "" : "s"}{" "}
                total
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
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
