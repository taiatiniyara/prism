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
  customerTypes: string[];
  reportPeriodId: number;
  serviceAreaId: number;
  onToggleRelevance: (
    payload: SetRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [rows, setRows] = useState<RelevanceRow[]>(props.rows);

  const customerTypes = useMemo(
    () => props.customerTypes,
    [props.customerTypes],
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

  const onCheckedChange = (
    paymentModeId: number,
    customerTypeId: number,
    inputDefId: number,
    checked: boolean,
  ) => {
    const previousRows = rows;

    setLabelValue(
      {
        paymentModeId,
        customerTypeId,
        inputDefId,
      },
      checked,
    );

    startTransition(async () => {
      const result = await props.onToggleRelevance({
        reportPeriodId: props.reportPeriodId,
        serviceAreaId: props.serviceAreaId,
        paymentModeId,
        customerTypeId,
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
    paymentModeId: number,
    customerTypeId: number,
    checked: boolean,
    labels: RelevanceLabel[],
  ) => {
    const previousRows = rows;

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
            paymentModeId,
            customerTypeId,
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
              Payment Mode
            </th>
            {customerTypes.map((customerType) => (
              <th
                key={customerType}
                className="sticky top-0 z-30 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap min-w-72"
              >
                {customerType}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.paymentModeId}>
              <td className="sticky left-0 z-20 border bg-background px-5 py-4 text-sm font-semibold align-top">
                {row.paymentMode}
              </td>
              {row.cells.map((cell) => (
                <td
                  key={`${row.paymentModeId}-${cell.customerTypeId}`}
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
                              disabled={isSaving}
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
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
