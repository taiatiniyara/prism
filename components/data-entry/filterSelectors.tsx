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
  return (
    <div className="space-y-1 w-38">
      {showLabel ? (
        <Label
          className={compact ? "text-[12px] leading-none" : "text-xs"}
          htmlFor={id}
        >
          {label}
        </Label>
      ) : null}
      <Select
        value={
          value == null ? (includeAllOption ? "all" : undefined) : String(value)
        }
        onValueChange={(next) =>
          onChange(includeAllOption && next === "all" ? null : Number(next))
        }
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className={`w-full min-w-0 ${compact ? "h-7 px-1.5 py-0 text-[11px]" : "h-8 px-2 text-xs"} shadow`}
          aria-label={label}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeAllOption ? <SelectItem value="all">All</SelectItem> : null}
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
    includeAllOption={false}
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
) => (
  <FilterSelect
    id="service-area-select"
    label="Service Area"
    placeholder="Select service area"
    {...props}
  />
);

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
