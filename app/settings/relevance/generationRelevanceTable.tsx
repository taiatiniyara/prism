"use client";

import { Button } from "@/components/ui/button";
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
      .sort((a, b) => b.energyProvider.localeCompare(a.energyProvider));
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

    return Array.from(grouped.values())
      .sort((a, b) => b.energyResourceType.localeCompare(a.energyResourceType))
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((a, b) =>
          a.energySource.localeCompare(b.energySource),
        ),
      }));
  }, [rows]);

  const onCellToggle = (
    energySourceId: number,
    energyProviderId: number,
    energyResourceTypeId: number,
    checked: boolean,
  ) => {
    const previousRows = rows;

    setRows((prev) =>
      prev.map((row) => {
        if (
          row.energySourceId !== energySourceId ||
          row.energyResourceTypeId !== energyResourceTypeId
        ) {
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

    startTransition(() => {
      void (async () => {
        const loadingToastId = toast.loading("Updating relevance...");
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
          toast.dismiss(loadingToastId);
          return;
        }

        toast.dismiss(loadingToastId);
        toast.success(result.message);
      })();
    });
  };

  const onBlockToggle = (
    energySourceIds: number[],
    energyProviderId: number,
    energyResourceTypeId: number,
    checked: boolean,
  ) => {
    if (energySourceIds.length === 0) {
      return;
    }

    const previousRows = rows;
    const energySourceIdsSet = new Set(energySourceIds);

    setRows((prev) =>
      prev.map((row) => {
        if (
          !energySourceIdsSet.has(row.energySourceId) ||
          row.energyResourceTypeId !== energyResourceTypeId
        ) {
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

    startTransition(() => {
      void (async () => {
        const loadingToastId = toast.loading("Updating relevance...");
        const results = await Promise.all(
          energySourceIds.map((energySourceId) =>
            props.onToggleRelevance({
              reportPeriodId: props.reportPeriodId,
              serviceAreaId: props.serviceAreaId,
              energySourceId,
              energyProviderId,
              isRelevant: checked,
            }),
          ),
        );

        const failedResult = results.find((result) => !result.success);

        if (failedResult) {
          setRows(previousRows);
          toast.error(failedResult.message);
          toast.dismiss(loadingToastId);
          return;
        }

        toast.dismiss(loadingToastId);
        toast.success("Relevance updated.");
      })();
    });
  };

  return (
    <div className="space-y-3">
      <div className="max-h-[70vh] overflow-auto border">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/30">
              <th className="sticky top-0 left-0 z-40 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap min-w-48">
                Energy Resource Type
              </th>
              {providers.map((provider) => (
                <th
                  key={provider.energyProviderId}
                  className="sticky top-0 z-30 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap min-w-56"
                >
                  {provider.energyProvider}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsByEnergyResourceType.map((group) => (
              <tr key={group.energyResourceTypeId}>
                <td className="sticky left-0 z-20 border bg-background px-3 py-2 font-medium whitespace-nowrap">
                  {group.energyResourceType}
                </td>
                {providers.map((provider) => {
                  const allChecked = group.rows.every((row) => {
                    const cell = row.cells.find(
                      (item) =>
                        item.energyProviderId === provider.energyProviderId,
                    );

                    return cell?.isRelevant ?? true;
                  });

                  return (
                    <td
                      key={`${group.energyResourceTypeId}-${provider.energyProviderId}`}
                      className="border px-3 py-2 align-top"
                    >
                      <div className="mb-1.5">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          variant="outline"
                          disabled={isSaving}
                          onClick={() =>
                            onBlockToggle(
                              group.rows.map((row) => row.energySourceId),
                              provider.energyProviderId,
                              group.energyResourceTypeId,
                              !allChecked,
                            )
                          }
                        >
                          {allChecked ? "Uncheck all" : "Check all"}
                        </Button>
                      </div>
                      <ul className="space-y-1.5">
                        {group.rows.map((row) => {
                          const cell = row.cells.find(
                            (item) =>
                              item.energyProviderId ===
                              provider.energyProviderId,
                          );

                          return (
                            <li
                              key={`${row.energySourceId}-${row.energyResourceTypeId}-${provider.energyProviderId}`}
                            >
                              <label className="flex items-center gap-1.5">
                                <Checkbox
                                  checked={cell?.isRelevant ?? true}
                                  disabled={isSaving}
                                  onCheckedChange={(next) =>
                                    onCellToggle(
                                      row.energySourceId,
                                      provider.energyProviderId,
                                      row.energyResourceTypeId,
                                      next === true,
                                    )
                                  }
                                />
                                <span className="text-xs">
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
    </div>
  );
}
