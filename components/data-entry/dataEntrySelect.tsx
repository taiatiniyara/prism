"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

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
  searchable?: boolean;
}

export function DataEntrySelect({
  options,
  placeholder,
  id,
  ariaLabel,
  size = "default",
  triggerClassName,
  contentClassName,
  searchable = false,
  ...props
}: DataEntrySelectProps) {
  const triggerSize = size === "compact" ? "sm" : "default";
  const [search, setSearch] = React.useState("");

  const filteredOptions = searchable
    ? options.filter((option) =>
        option.label.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

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
        {searchable ? (
          <div className="flex items-center border-b px-3 py-2 sticky top-0 bg-white z-10">
            <Search className="size-3.5 text-muted-foreground mr-1.5 shrink-0" />
            <Input
              className="h-7 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}
        {filteredOptions.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
        {searchable && filteredOptions.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No results found.
          </p>
        ) : null}
      </SelectContent>
    </Select>
  );
}
