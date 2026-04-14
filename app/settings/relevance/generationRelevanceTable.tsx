"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

type RelevanceLabel = {
  inputDefId: number;
  dataLabel: string;
  isRelevant: boolean;
  dataEntryId: string | null;
};

type RelevanceCell = {
  energyProviderId: number;
  energyProvider: string;
  isRelevant: boolean;
  relevantCount: number;
  totalCount: number;
  dataLabels: RelevanceLabel[];
};

type RelevanceRow = {
  energySourceId: number;
  energySource: string;
  cells: RelevanceCell[];
};

type SetRelevancePayload = {
  reportPeriodId: number;
  serviceAreaId: number;
  energySourceId: number;
  energyProviderId: number;
  inputDefId: number;
  isRelevant: boolean;
};

const summarizeCell = (cell: RelevanceCell): RelevanceCell => {
  const relevantCount = cell.dataLabels.filter(
    (label) => label.isRelevant,
  ).length;

  return {
    ...cell,
    relevantCount,
    totalCount: cell.dataLabels.length,
    isRelevant:
      cell.dataLabels.length > 0 && relevantCount === cell.dataLabels.length,
  };
};

export default function GenerationRelevanceTable(props: {
  rows: RelevanceRow[];
  energyProviders: string[];
  reportPeriodId: number;
  serviceAreaId: number;
  onToggleRelevance: (
    payload: SetRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [rows, setRows] = useState<RelevanceRow[]>(props.rows);

  const energyProviders = useMemo(
    () => props.energyProviders,
    [props.energyProviders],
  );

  const setLabelValue = (
    target: {
      energySourceId: number;
      energyProviderId: number;
      inputDefId: number;
    },
    nextValue: boolean,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.energySourceId !== target.energySourceId) {
          return row;
        }

        return {
          ...row,
          cells: row.cells.map((cell) => {
            if (cell.energyProviderId !== target.energyProviderId) {
              return cell;
            }

            const nextCell = {
              ...cell,
              dataLabels: cell.dataLabels.map((label) =>
                label.inputDefId === target.inputDefId
                  ? {
                      ...label,
                      isRelevant: nextValue,
                    }
                  : label,
              ),
            };

            return summarizeCell(nextCell);
          }),
        };
      }),
    );
  };

  const onCheckedChange = (
    energySourceId: number,
    energyProviderId: number,
    inputDefId: number,
    checked: boolean,
  ) => {
    const previousRows = rows;

    setLabelValue(
      {
        energySourceId,
        energyProviderId,
        inputDefId,
      },
      checked,
    );

    startTransition(async () => {
      const result = await props.onToggleRelevance({
        reportPeriodId: props.reportPeriodId,
        serviceAreaId: props.serviceAreaId,
        energySourceId,
        energyProviderId,
        inputDefId,
        isRelevant: checked,
      });

      if (!result.success) {
        setRows(previousRows);
        toast.error(result.message);
      }
    });
  };

  const onBlockCheckedChange = (
    energySourceId: number,
    energyProviderId: number,
    checked: boolean,
    labels: RelevanceLabel[],
  ) => {
    const previousRows = rows;

    setRows((prev) =>
      prev.map((row) => {
        if (row.energySourceId !== energySourceId) {
          return row;
        }

        return {
          ...row,
          cells: row.cells.map((cell) => {
            if (cell.energyProviderId !== energyProviderId) {
              return cell;
            }

            const nextCell = {
              ...cell,
              dataLabels: cell.dataLabels.map((label) => ({
                ...label,
                isRelevant: checked,
              })),
            };

            return summarizeCell(nextCell);
          }),
        };
      }),
    );

    startTransition(async () => {
      const results = await Promise.all(
        labels.map((label) =>
          props.onToggleRelevance({
            reportPeriodId: props.reportPeriodId,
            serviceAreaId: props.serviceAreaId,
            energySourceId,
            energyProviderId,
            inputDefId: label.inputDefId,
            isRelevant: checked,
          }),
        ),
      );

      const failedResult = results.find((result) => !result.success);

      if (failedResult) {
        setRows(previousRows);
        toast.error(failedResult.message);
      }
    });
  };

  return (
    <div className="max-h-[70vh] overflow-auto border">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30">
            <th className="sticky left-0 top-0 z-40 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-52">
              Energy Source
            </th>
            {energyProviders.map((provider) => (
              <th
                key={provider}
                className="sticky top-0 z-30 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-72"
              >
                {provider}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.energySourceId}>
              <td className="sticky left-0 z-20 border bg-background px-5 py-4 text-sm font-semibold align-top">
                {row.energySource}
              </td>
              {row.cells.map((cell) => (
                <td
                  key={`${row.energySourceId}-${cell.energyProviderId}`}
                  className="border px-5 py-4 align-top"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={cell.isRelevant}
                          disabled={isSaving || cell.totalCount === 0}
                          onCheckedChange={(next) =>
                            onBlockCheckedChange(
                              row.energySourceId,
                              cell.energyProviderId,
                              next === true,
                              cell.dataLabels,
                            )
                          }
                        />
                        <span>Entire block</span>
                      </label>
                      <span className="text-sm font-medium">
                        {cell.relevantCount}/{cell.totalCount} relevant
                      </span>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {cell.dataLabels.map((label) => (
                        <li
                          key={`${cell.energyProviderId}-${label.inputDefId}`}
                          className="flex items-center justify-between gap-4 leading-6"
                        >
                          <label className="flex items-center gap-3 text-muted-foreground">
                            <Checkbox
                              checked={label.isRelevant}
                              disabled={isSaving}
                              onCheckedChange={(next) =>
                                onCheckedChange(
                                  row.energySourceId,
                                  cell.energyProviderId,
                                  label.inputDefId,
                                  next === true,
                                )
                              }
                            />
                            <span className="whitespace-nowrap">
                              {label.dataLabel}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
