"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

type RelevanceCell = {
  energyProviderId: number;
  energyProvider: string;
  isRelevant: boolean;
  relatedInputCount: number;
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
  isRelevant: boolean;
};

export default function GenerationRelevanceTable(props: {
  rows: RelevanceRow[];
  reportPeriodId: number;
  serviceAreaId: number;
  onToggleRelevance: (
    payload: SetRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [rows, setRows] = useState<RelevanceRow[]>(props.rows);

  const providerGroups = useMemo(() => {
    if (rows.length === 0) {
      return [] as {
        energyProviderId: number;
        energyProvider: string;
        sources: {
          energySourceId: number;
          energySource: string;
          isRelevant: boolean;
          relatedInputCount: number;
        }[];
      }[];
    }

    return rows[0].cells
      .map((providerCell) => ({
        energyProviderId: providerCell.energyProviderId,
        energyProvider: providerCell.energyProvider,
        sources: rows.map((row) => {
          const cell =
            row.cells.find(
              (value) =>
                value.energyProviderId === providerCell.energyProviderId,
            ) ?? providerCell;

          return {
            energySourceId: row.energySourceId,
            energySource: row.energySource,
            isRelevant: cell.isRelevant,
            relatedInputCount: cell.relatedInputCount,
          };
        }),
      }))
      .sort((a, b) => b.energyProvider.localeCompare(a.energyProvider));
  }, [rows]);

  const onCellToggle = (
    energySourceId: number,
    energyProviderId: number,
    checked: boolean,
  ) => {
    const previousRows = rows;

    setRows((prev) =>
      prev.map((row) => {
        if (row.energySourceId !== energySourceId) {
          return row;
        }

        return {
          ...row,
          cells: row.cells.map((cell) =>
            cell.energyProviderId === energyProviderId
              ? {
                  ...cell,
                  isRelevant: checked,
                }
              : cell,
          ),
        };
      }),
    );

    startTransition(async () => {
      const result = await props.onToggleRelevance({
        reportPeriodId: props.reportPeriodId,
        serviceAreaId: props.serviceAreaId,
        energySourceId,
        energyProviderId,
        isRelevant: checked,
      });

      if (!result.success) {
        setRows(previousRows);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="max-h-[70vh] overflow-auto border">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30">
            {providerGroups.map((provider) => (
              <th
                key={provider.energyProviderId}
                className="sticky top-0 z-30 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-80"
              >
                {provider.energyProvider}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {providerGroups.map((provider) => (
              <td
                key={provider.energyProviderId}
                className="border px-5 py-4 align-top"
              >
                <ul className="space-y-3">
                  {provider.sources.map((source) => (
                    <li
                      key={`${provider.energyProviderId}-${source.energySourceId}`}
                    >
                      <label className="flex items-center gap-3 text-sm font-medium">
                        <Checkbox
                          checked={source.isRelevant}
                          disabled={isSaving || source.relatedInputCount === 0}
                          onCheckedChange={(next) =>
                            onCellToggle(
                              source.energySourceId,
                              provider.energyProviderId,
                              next === true,
                            )
                          }
                        />
                        <span>{source.energySource}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
