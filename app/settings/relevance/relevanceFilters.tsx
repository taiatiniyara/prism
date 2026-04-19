"use client";

import { Label } from "@/components/ui/label";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type FilterOption = {
  id: number;
  name: string;
};

const toQueryValue = (value: number | null): string =>
  value != null ? String(value) : "";

export default function RelevanceFilters(props: {
  reportPeriods: FilterOption[];
  serviceAreas: FilterOption[];
  selectedReportPeriodId: number | null;
  selectedServiceAreaId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = (
    key: "report_period_id" | "service_area_id",
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

  return (
    <div className="flex flex-wrap items-end gap-3 sm:gap-4">
      <div className="space-y-1">
        <Label
          htmlFor="report_period_id"
          className="text-xs font-medium"
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
          className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm"
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
          className="text-xs font-medium"
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
          className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm"
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
    </div>
  );
}
