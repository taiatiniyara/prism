"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DataEntryFilterOption } from "@/app/data-entry/types";

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
}: FilterSelectProps) {
  return (
    <div
      className={`grid ${showLabel ? "gap-1" : "gap-0"} ${compact ? "w-34" : "w-50"}`}
    >
      {showLabel ? (
        <Label
          className="text-xs"
          htmlFor={id}
        >
          {label}
        </Label>
      ) : null}
      <Select
        value={value == null ? "all" : String(value)}
        onValueChange={(next) => onChange(next === "all" ? null : Number(next))}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className={`w-full ${compact ? "h-7 text-[11px] py-0 px-2" : "text-xs py-1"} shadow`}
          aria-label={label}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={String(option.id)}
            >
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    label="Input Category"
    placeholder="Select input category"
    {...props}
  />
);

export const InputSubcategorySelect = (
  props: Omit<FilterSelectProps, "id" | "label" | "placeholder">,
) => (
  <FilterSelect
    id="input-subcategory-select"
    label="Input Subcategory"
    placeholder="Select input subcategory"
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
) => (
  <FilterSelect
    id="service-area-select"
    label="Service Area"
    placeholder="Select service area"
    {...props}
  />
);
