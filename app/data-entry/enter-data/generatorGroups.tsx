"use client";

import { useState } from "react";

import { DataEntryGeneratorGroupView } from "@/app/data-entry/types";

import InputCell from "@/app/data-entry/enter-data/inputCell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GeneratorGroupsProps {
  groups: DataEntryGeneratorGroupView[];
}

export default function GeneratorGroups({ groups }: GeneratorGroupsProps) {
  const [openGeneratorId, setOpenGeneratorId] = useState<number | null>(null);

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
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.generatorId}>
          <details open={openGeneratorId === group.generatorId}>
            <summary
              className="cursor-pointer list-none font-medium p-2 bg-slate-200 rounded-md"
              onClick={(event) => {
                event.preventDefault();
                setOpenGeneratorId((currentOpenGroup) =>
                  currentOpenGroup === group.generatorId
                    ? null
                    : group.generatorId,
                );
              }}
            >
              {group.generatorName}
            </summary>
            <div className="grid lg:grid-cols-3 gap-6 sm:grid-cols-1 md:grid-cols-2 px-4 py-3">
              {group.rows.map((row) => (
                <div key={`${group.generatorId}-${row.inputDefId}`}>
                  <div className="flex justify-between items-end">
                    <span className="font-semibold text-sm">
                      {row.inputName}
                    </span>
                    {row.unitName ? (
                      <span className="text-xs text-slate-500">
                        {row.unitName}
                      </span>
                    ) : null}
                  </div>
                  <InputCell
                    key={`${group.generatorId}-${row.inputDefId}-${row.dataEntryId ?? "new"}-${row.updatedAt ?? "na"}-${row.isDataNotAvailable ? 1 : 0}`}
                    row={row}
                  />
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
