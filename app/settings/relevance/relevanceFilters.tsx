"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type FilterOption = {
  id: number;
  name: string;
};

type TariffRelevanceLabel = {
  inputDefId: number;
  isRelevant: boolean;
};

type TariffRelevanceCell = {
  customerTypeId: number;
  dataLabels: TariffRelevanceLabel[];
};

type TariffRelevanceRow = {
  paymentModeId: number;
  cells: TariffRelevanceCell[];
};

type SetTariffRelevancePayload = {
  reportPeriodId: number;
  serviceAreaId: number;
  paymentModeId: number;
  customerTypeId: number;
  inputDefId: number;
  isRelevant: boolean;
};

const toQueryValue = (value: number | null): string =>
  value != null ? String(value) : "";

export default function RelevanceFilters(props: {
  reportPeriods: FilterOption[];
  serviceAreas: FilterOption[];
  selectedReportPeriodId: number | null;
  selectedServiceAreaId: number | null;
  customerTypes?: FilterOption[];
  selectedCustomerTypeIds?: number[];
  tariffRows?: TariffRelevanceRow[];
  onToggleTariffRelevance?: (
    payload: SetTariffRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingCustomerTypeIds, setPendingCustomerTypeIds] = useState<
    Set<number>
  >(new Set());

  const updateFilter = (
    key: "report_period_id" | "service_area_id" | "tariff_customer_type_ids",
    value: string,
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.replace(`${pathname}?${params.toString()}`, {
      scroll: false,
    });
  };

  const selectedCustomerTypeIds = props.selectedCustomerTypeIds ?? [];

  const onCustomerTypeCheckedChange = async (
    customerTypeId: number,
    checked: boolean,
  ) => {
    if (pendingCustomerTypeIds.has(customerTypeId)) {
      return;
    }

    if (
      props.onToggleTariffRelevance &&
      props.tariffRows &&
      props.selectedReportPeriodId != null &&
      props.selectedServiceAreaId != null
    ) {
      const updates: SetTariffRelevancePayload[] = [];

      for (const row of props.tariffRows) {
        const targetCell = row.cells.find(
          (cell) => cell.customerTypeId === customerTypeId,
        );

        if (!targetCell) {
          continue;
        }

        for (const label of targetCell.dataLabels) {
          if (label.isRelevant === checked) {
            continue;
          }

          updates.push({
            reportPeriodId: props.selectedReportPeriodId,
            serviceAreaId: props.selectedServiceAreaId,
            paymentModeId: row.paymentModeId,
            customerTypeId,
            inputDefId: label.inputDefId,
            isRelevant: checked,
          });
        }
      }

      setPendingCustomerTypeIds((prev) => {
        const next = new Set(prev);
        next.add(customerTypeId);
        return next;
      });

      const loadingToastId = toast.loading("Updating tariff relevance...");

      try {
        if (updates.length > 0) {
          const results = await Promise.all(
            updates.map((payload) => props.onToggleTariffRelevance!(payload)),
          );
          const failed = results.find((result) => !result.success);

          if (failed) {
            toast.error(failed.message);
            return;
          }

          toast.success("Tariff relevance updated.");
        }
      } finally {
        toast.dismiss(loadingToastId);
        setPendingCustomerTypeIds((prev) => {
          const next = new Set(prev);
          next.delete(customerTypeId);
          return next;
        });
      }
    }

    const nextIds = new Set(selectedCustomerTypeIds);

    if (checked) {
      nextIds.add(customerTypeId);
    } else {
      nextIds.delete(customerTypeId);
    }

    updateFilter(
      "tariff_customer_type_ids",
      Array.from(nextIds)
        .sort((a, b) => a - b)
        .join(","),
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-2 sm:gap-3">
      <div className="space-y-1">
        <Label
          htmlFor="report_period_id"
          className="text-[11px] font-medium"
        >
          Report Period
        </Label>
        <select
          id="report_period_id"
          name="report_period_id"
          value={toQueryValue(props.selectedReportPeriodId)}
          onChange={(event) =>
            updateFilter("report_period_id", event.target.value)
          }
          className="h-8 min-w-40 rounded-md border bg-background px-2 text-xs"
        >
          {props.reportPeriods.map((option) => (
            <option
              key={option.id}
              value={option.id}
            >
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="service_area_id"
          className="text-[11px] font-medium"
        >
          Service Area
        </Label>
        <select
          id="service_area_id"
          name="service_area_id"
          value={toQueryValue(props.selectedServiceAreaId)}
          onChange={(event) =>
            updateFilter("service_area_id", event.target.value)
          }
          className="h-8 min-w-40 rounded-md border bg-background px-2 text-xs"
        >
          {props.serviceAreas.map((option) => (
            <option
              key={option.id}
              value={option.id}
            >
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {props.customerTypes && props.customerTypes.length > 0 ? (
        <div className="space-y-1">
          <Label className="text-[11px] font-medium">Customer Type</Label>
          <div className="min-w-56 rounded-md border bg-background px-2 py-1.5">
            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto pr-1">
              {props.customerTypes.map((option) => {
                const checked = selectedCustomerTypeIds.includes(option.id);

                return (
                  <label
                    key={option.id}
                    className="flex items-center gap-2 text-xs leading-5 whitespace-nowrap"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={pendingCustomerTypeIds.has(option.id)}
                      onCheckedChange={(next) => {
                        void onCustomerTypeCheckedChange(
                          option.id,
                          next === true,
                        );
                      }}
                    />
                    <span>{option.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
