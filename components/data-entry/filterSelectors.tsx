"use client";

import {
  DataEntrySelect,
  type DataEntrySelectOption,
} from "@/components/data-entry/dataEntrySelect";
import { Label } from "@/components/ui/label";
import { DataEntryFilterOption } from "@/app/data-entry/types";
import { useTerm } from "@/lib/terminology/useTerm";

interface FilterSelectProps {
  id: string;
  label: string;
  value: number | null;
  options: DataEntryFilterOption[];
  placeholder: string;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  showLabel?: boolean;
  compact?: boolean;
  includeAllOption?: boolean;
}

export function FilterSelect({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
  showLabel = true,
  compact = false,
  includeAllOption = true,
}: FilterSelectProps) {
  const selectOptions: DataEntrySelectOption[] = [
    ...(includeAllOption ? [{ value: "all", label: "All" }] : []),
    ...options.map((option) => ({
      value: String(option.id),
      label: option.name,
    })),
  ];

  return (
    <div className={compact ? "w-24 space-y-0.5" : "w-32 space-y-1"}>
      {showLabel ? (
        <Label
          className={compact ? "text-[11px] leading-none" : "text-xs"}
          htmlFor={id}
        >
          {label}
        </Label>
      ) : null}
      <DataEntrySelect
        value={
          value == null ? (includeAllOption ? "all" : undefined) : String(value)
        }
        onValueChange={(next) =>
          onChange(includeAllOption && next === "all" ? null : Number(next))
        }
        disabled={disabled}
        id={id}
        ariaLabel={label}
        placeholder={placeholder}
        options={selectOptions}
        size={compact ? "compact" : "default"}
        triggerClassName={
          compact ? "data-[size=sm]:h-7 px-1 text-[10px]" : "h-8"
        }
        searchable={options.length > 10}
      />
    </div>
  );
}

export const ReportTypeSelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="report-type-select"
    label="Report Type"
    placeholder="Select report type"
    {...props}
  />
);

export const ReportPeriodSelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="report-period-select"
    label="Report Period"
    placeholder="Select report period"
    {...props}
  />
);

export const InputCategorySelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="input-category-select"
    label="Measures Category"
    placeholder="Select input category"
    includeAllOption={false}
    {...props}
  />
);

export const InputSubcategorySelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="input-subcategory-select"
    label="Measures Subcategory"
    placeholder="Select input subcategory"
    includeAllOption={false}
    {...props}
  />
);

export const KpiCategorySelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="kpi-category-select"
    label="KPI Category"
    placeholder="Select KPI category"
    {...props}
  />
);

export const KpiSubcategorySelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="kpi-subcategory-select"
    label="KPI Subcategory"
    placeholder="Select KPI subcategory"
    {...props}
  />
);

export const ServiceAreaSelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => {
  const label = useTerm("service_area");
  return (
    <FilterSelect
      id="service-area-select"
      label={label}
      placeholder={`Select ${label.toLowerCase()}`}
      {...props}
    />
  );
};

export const DataEntryStatusSelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="data-entry-status-select"
    label="Data Entry Status"
    placeholder="Select data entry status"
    {...props}
  />
);
