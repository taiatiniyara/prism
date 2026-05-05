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
  energyResourceTypeId: number;
  energyResourceType: string;
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

  const providers = useMemo(() => {
    if (rows.length === 0) {
      return [] as { energyProviderId: number; energyProvider: string }[];
    }

    return rows[0].cells
      .map((providerCell) => ({
        energyProviderId: providerCell.energyProviderId,
        energyProvider: providerCell.energyProvider,
      }))
      .sort((a, b) => a.energyProvider.localeCompare(b.energyProvider));
  }, [rows]);

  const rowsByEnergyResourceType = useMemo(() => {
    const grouped = new Map<
      number,
      {
        energyResourceTypeId: number;
        energyResourceType: string;
        rows: RelevanceRow[];
      }
    >();

    for (const row of rows) {
      const existing = grouped.get(row.energyResourceTypeId);

      if (existing) {
        existing.rows.push(row);
        continue;
      }

      grouped.set(row.energyResourceTypeId, {
        energyResourceTypeId: row.energyResourceTypeId,
        energyResourceType: row.energyResourceType,
        rows: [row],
      });
    }

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) =>
        a.energySource.localeCompare(b.energySource),
      ),
    }));
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
            <th className="sticky top-0 left-0 z-40 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-64">
              Energy Resource Type
            </th>
            {providers.map((provider) => (
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
          {rowsByEnergyResourceType.map((group) => (
            <tr key={group.energyResourceTypeId}>
              <td className="sticky left-0 z-20 border bg-background px-5 py-3 font-medium whitespace-nowrap">
                {group.energyResourceType}
              </td>
              {providers.map((provider) => {
                return (
                  <td
                    key={`${group.energyResourceTypeId}-${provider.energyProviderId}`}
                    className="border px-5 py-3 align-top"
                  >
                    <ul className="space-y-2">
                      {group.rows.map((row) => {
                        const cell = row.cells.find(
                          (item) =>
                            item.energyProviderId === provider.energyProviderId,
                        );

                        return (
                          <li
                            key={`${row.energySourceId}-${row.energyResourceTypeId}-${provider.energyProviderId}`}
                          >
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={cell?.isRelevant ?? true}
                                disabled={
                                  isSaving ||
                                  (cell?.relatedInputCount ?? 0) === 0
                                }
                                onCheckedChange={(next) =>
                                  onCellToggle(
                                    row.energySourceId,
                                    provider.energyProviderId,
                                    next === true,
                                  )
                                }
                              />
                              <span className="text-sm">
                                {row.energySource}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
