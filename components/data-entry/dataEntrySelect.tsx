"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface DataEntrySelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const triggerSizeClassName = {
  compact: "data-[size=sm]:h-7 px-1 text-[11px] shadow-none",
  default: "h-9 px-3 text-sm shadow-sm",
  input: "min-h-10 px-3 py-2.5 text-base md:text-sm shadow",
} as const;

export const getDataEntrySelectTriggerClassName = (
  size: keyof typeof triggerSizeClassName = "default",
  className?: string,
) =>
  cn(
    "w-full min-w-0 border-input bg-background text-foreground",
    triggerSizeClassName[size],
    className,
  );

interface DataEntrySelectProps extends Omit<
  React.ComponentProps<typeof Select>,
  "children"
> {
  options: DataEntrySelectOption[];
  placeholder: string;
  id?: string;
  ariaLabel?: string;
  size?: keyof typeof triggerSizeClassName;
  triggerClassName?: string;
  contentClassName?: string;
}

export function DataEntrySelect({
  options,
  placeholder,
  id,
  ariaLabel,
  size = "default",
  triggerClassName,
  contentClassName,
  ...props
}: DataEntrySelectProps) {
  const triggerSize = size === "compact" ? "sm" : "default";

  return (
    <Select {...props}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        size={triggerSize}
        className={getDataEntrySelectTriggerClassName(size, triggerClassName)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
