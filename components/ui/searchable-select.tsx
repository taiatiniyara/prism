"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  searchContainerClassName?: string;
  searchInputClassName?: string;
  itemClassName?: string;
  allowEscapeKeyPropagation?: boolean;
  onValueChange: (value: string) => void;
}

export function SearchableSelect({
  options,
  value,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled,
  triggerClassName,
  contentClassName,
  searchContainerClassName,
  searchInputClassName,
  itemClassName,
  allowEscapeKeyPropagation = true,
  onValueChange,
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLowerCase().includes(normalizedSearch),
      ),
    [options, normalizedSearch],
  );

  const shouldStopPropagation = (key: string) =>
    key !== "Escape" || !allowEscapeKeyPropagation;

  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(nextValue) => {
        onValueChange(nextValue);
        setSearch("");
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        // Keep dropdown width anchored to trigger width so the search input does not shift while filtering.
        className={cn("w-(--radix-select-trigger-width)", contentClassName)}
      >
        <div className={cn("p-2", searchContainerClassName)}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (shouldStopPropagation(event.key)) {
                event.stopPropagation();
              }
            }}
            onKeyUp={(event) => {
              if (shouldStopPropagation(event.key)) {
                event.stopPropagation();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={searchPlaceholder}
            className={cn("h-8 w-full", searchInputClassName)}
          />
        </div>
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={itemClassName}
            >
              {option.label}
            </SelectItem>
          ))
        ) : (
          <div className="text-muted-foreground px-3 py-2 text-sm">
            {emptyLabel}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
