"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type RelevanceLabel = {
  inputDefId: number;
  dataLabel: string;
  isRelevant: boolean;
  dataEntryId: string | null;
};

type RelevanceCell = {
  customerTypeId: number;
  customerType: string;
  isRelevant: boolean;
  relevantCount: number;
  totalCount: number;
  dataLabels: RelevanceLabel[];
};

type RelevanceRow = {
  paymentModeId: number;
  paymentMode: string;
  cells: RelevanceCell[];
};

type CustomerTypeOption = {
  id: number;
  name: string;
};

type SetRelevancePayload = {
  reportPeriodId: number;
  serviceAreaId: number;
  paymentModeId: number;
  customerTypeId: number;
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

export default function TariffRelevanceTable(props: {
  rows: RelevanceRow[];
  customerTypes: CustomerTypeOption[];
  selectedCustomerTypeIds: number[];
  reportPeriodId: number;
  serviceAreaId: number;
  onToggleRelevance: (
    payload: SetRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const [rows, setRows] = useState<RelevanceRow[]>(props.rows);
  const [pendingLabelKeys, setPendingLabelKeys] = useState<Set<string>>(
    new Set(),
  );
  const [pendingBlockKeys, setPendingBlockKeys] = useState<Set<string>>(
    new Set(),
  );

  const selectedCustomerTypeIdSet = useMemo(
    () => new Set(props.selectedCustomerTypeIds),
    [props.selectedCustomerTypeIds],
  );

  const customerTypes = useMemo(
    () =>
      props.customerTypes.filter((customerType) =>
        selectedCustomerTypeIdSet.has(customerType.id),
      ),
    [props.customerTypes, selectedCustomerTypeIdSet],
  );

  const visibleRows = useMemo(
    () =>
      rows
        .map((row) => ({
          ...row,
          cells: row.cells.filter((cell) =>
            selectedCustomerTypeIdSet.has(cell.customerTypeId),
          ),
        }))
        .filter((row) => row.cells.length > 0),
    [rows, selectedCustomerTypeIdSet],
  );

  const setLabelValue = (
    target: {
      paymentModeId: number;
      customerTypeId: number;
      inputDefId: number;
    },
    nextValue: boolean,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.paymentModeId !== target.paymentModeId) {
          return row;
        }

        return {
          ...row,
          cells: row.cells.map((cell) => {
            if (cell.customerTypeId !== target.customerTypeId) {
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

  const setBlockValue = (
    target: {
      paymentModeId: number;
      customerTypeId: number;
    },
    nextValue: boolean,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.paymentModeId !== target.paymentModeId) {
          return row;
        }

        return {
          ...row,
          cells: row.cells.map((cell) => {
            if (cell.customerTypeId !== target.customerTypeId) {
              return cell;
            }

            const nextCell = {
              ...cell,
              dataLabels: cell.dataLabels.map((label) => ({
                ...label,
                isRelevant: nextValue,
              })),
            };

            return summarizeCell(nextCell);
          }),
        };
      }),
    );
  };

  const onCheckedChange = (
    paymentModeId: number,
    customerTypeId: number,
    inputDefId: number,
    checked: boolean,
  ) => {
    const labelKey = `${paymentModeId}:${customerTypeId}:${inputDefId}`;

    setLabelValue(
      {
        paymentModeId,
        customerTypeId,
        inputDefId,
      },
      checked,
    );

    setPendingLabelKeys((prev) => {
      const next = new Set(prev);
      next.add(labelKey);
      return next;
    });

    const loadingToastId = toast.loading("Updating relevance...");

    void props
      .onToggleRelevance({
        reportPeriodId: props.reportPeriodId,
        serviceAreaId: props.serviceAreaId,
        paymentModeId,
        customerTypeId,
        inputDefId,
        isRelevant: checked,
      })
      .then((result) => {
        if (!result.success) {
          setLabelValue(
            {
              paymentModeId,
              customerTypeId,
              inputDefId,
            },
            !checked,
          );
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
      })
      .finally(() => {
        toast.dismiss(loadingToastId);
        setPendingLabelKeys((prev) => {
          const next = new Set(prev);
          next.delete(labelKey);
          return next;
        });
      });
  };

  const onBlockCheckedChange = (
    paymentModeId: number,
    customerTypeId: number,
    checked: boolean,
    labels: RelevanceLabel[],
  ) => {
    const blockKey = `${paymentModeId}:${customerTypeId}`;
    const previousByInputDefId = new Map(
      labels.map((label) => [label.inputDefId, label.isRelevant]),
    );

    setBlockValue(
      {
        paymentModeId,
        customerTypeId,
      },
      checked,
    );

    setPendingBlockKeys((prev) => {
      const next = new Set(prev);
      next.add(blockKey);
      return next;
    });

    const loadingToastId = toast.loading("Updating relevance...");

    void Promise.all(
      labels.map((label) =>
        props.onToggleRelevance({
          reportPeriodId: props.reportPeriodId,
          serviceAreaId: props.serviceAreaId,
          paymentModeId,
          customerTypeId,
          inputDefId: label.inputDefId,
          isRelevant: checked,
        }),
      ),
    )
      .then((results) => {
        const failedResult = results.find((result) => !result.success);

        if (failedResult) {
          setRows((prev) =>
            prev.map((row) => {
              if (row.paymentModeId !== paymentModeId) {
                return row;
              }

              return {
                ...row,
                cells: row.cells.map((cell) => {
                  if (cell.customerTypeId !== customerTypeId) {
                    return cell;
                  }

                  const revertedCell = {
                    ...cell,
                    dataLabels: cell.dataLabels.map((label) => ({
                      ...label,
                      isRelevant:
                        previousByInputDefId.get(label.inputDefId) ??
                        label.isRelevant,
                    })),
                  };

                  return summarizeCell(revertedCell);
                }),
              };
            }),
          );
          toast.error(failedResult.message);
          return;
        }

        if (results.length > 0) {
          toast.success("Tariff relevance updated.");
        }
      })
      .finally(() => {
        toast.dismiss(loadingToastId);
        setPendingBlockKeys((prev) => {
          const next = new Set(prev);
          next.delete(blockKey);
          return next;
        });
      });
  };

  return (
    <div className="max-h-[70vh] overflow-auto border">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30">
            <th className="sticky left-0 top-0 z-40 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-52">
              Payment Mode
            </th>
            {customerTypes.map((customerType) => (
              <th
                key={customerType.id}
                className="sticky top-0 z-30 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-72"
              >
                {customerType.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={customerTypes.length + 1}
                className="border px-5 py-6 text-center text-sm text-muted-foreground"
              >
                No customer types selected. Select at least one customer type to
                view the matrix.
              </td>
            </tr>
          ) : null}
          {visibleRows.map((row) => (
            <tr key={row.paymentModeId}>
              <td className="sticky left-0 z-20 border bg-background px-5 py-4 text-sm font-semibold align-top">
                {row.paymentMode}
              </td>
              {row.cells.map((cell) => {
                const blockKey = `${row.paymentModeId}:${cell.customerTypeId}`;
                const isBlockPending = pendingBlockKeys.has(blockKey);

                return (
                  <td
                    key={`${row.paymentModeId}-${cell.customerTypeId}`}
                    className="border px-5 py-4 align-top"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={cell.isRelevant}
                            disabled={isBlockPending || cell.totalCount === 0}
                            onCheckedChange={(next) =>
                              onBlockCheckedChange(
                                row.paymentModeId,
                                cell.customerTypeId,
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
                            key={`${cell.customerTypeId}-${label.inputDefId}`}
                            className="flex items-center justify-between gap-4 leading-6"
                          >
                            <label className="flex items-center gap-3 text-muted-foreground">
                              <Checkbox
                                checked={label.isRelevant}
                                disabled={pendingLabelKeys.has(
                                  `${row.paymentModeId}:${cell.customerTypeId}:${label.inputDefId}`,
                                )}
                                onCheckedChange={(next) =>
                                  onCheckedChange(
                                    row.paymentModeId,
                                    cell.customerTypeId,
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
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
