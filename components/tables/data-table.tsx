"use client";

import { useState, useMemo, useCallback } from "react";
import { Heading } from "../heading";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  DataTableCreateForm,
  DataTableCreateFormProps,
  DataTableFormResponse,
  FieldType,
} from "./data-table-create-form";

import DataTableUpdateForm from "./data-table-update-form";
import { formatLabel } from "@/lib/formatters";
import {
  useFormId,
  useFormOverrides,
  useReorderableList,
} from "../dev/form-overrides-provider";
import BooleanToggle from "./booleanToggle";
import { FaSquare } from "react-icons/fa";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Checkbox } from "../ui/checkbox";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  Columns3Icon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  GripVertical,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface DataTableProps<T extends DataTableRecord> {
  columns: DataTableColumn<T>[];
  title: string;
  data: T[];
  quickFilters?: {
    column: keyof T;
    label: string;
    allLabel?: string;
  }[];
  createFormProps?: DataTableCreateFormProps<T>;
  updateFormProps?: {
    formAction: (body: Partial<T>) => Promise<DataTableFormResponse<T>>;
    fields: {
      key: keyof T;
      label?: string;
      type: FieldType;
      required?: boolean;
      disabled?: boolean;
      className?: string;
      selectList?: {
        label: string;
        value: string | number;
      }[];
      managedListName?: string;
    }[];
  };
  reorderRowsProps?: {
    orderKey: keyof T;
    formAction: (
      rows: {
        id: T["id"];
        order: number;
      }[],
    ) => Promise<{ success: boolean; message: string }>;
  };
}

type SortDirection = "asc" | "desc" | null;
type ColumnFilter = { search: string; selectedValues: string[] };

type DataTableRecord = { id: string | number };

type DataTableColumn<T> =
  | keyof T
  | {
      name: keyof T;
      display: string;
    };

export default function DataTable<T extends DataTableRecord>(
  props: DataTableProps<T>,
) {
  const {
    columns,
    data,
    title,
    quickFilters,
    createFormProps,
    updateFormProps,
    reorderRowsProps,
  } = props;
  const formId = useFormId();
  // Columns live under a separate namespace so a column key can't collide with
  // a form-field key of the same name (both keyed by route otherwise).
  const columnFormId = `${formId}::columns`;
  const { getLabel, reorderActive, canEdit, getHidden, toggleHidden } =
    useFormOverrides();

  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  const [rows, setRows] = useState<T[]>(data);
  const [prevData, setPrevData] = useState(data);

  if (prevData !== data) {
    setPrevData(data);
    setRows(data);
  }
  const [quickFilterValues, setQuickFilterValues] = useState<
    Record<string, string>
  >({});
  const [draggedRowId, setDraggedRowId] = useState<T["id"] | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<T["id"] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const normalizedColumns = useMemo(
    () =>
      columns.map((column) => {
        if (typeof column === "object") {
          return column;
        }

        return {
          name: column,
          display: formatLabel(String(column)),
        };
      }),
    [columns],
  );

  // DEV column reorder (drag headers). Same store as form fields, namespaced.
  const { ordered: displayColumns, dragProps: colDragProps } =
    useReorderableList(columnFormId, normalizedColumns, (c) => String(c.name));

  // DEV column visibility: hidden columns drop out of the header + body; the
  // chooser (toolbar) lists all columns so hidden ones can be brought back.
  const visibleColumns = useMemo(
    () => displayColumns.filter((c) => !getHidden(columnFormId, String(c.name))),
    [displayColumns, getHidden, columnFormId],
  );

  const quickFilterColumns = useMemo(
    () => quickFilters?.map((filter) => filter.column) ?? [],
    [quickFilters],
  );

  const filterableColumns = useMemo(() => {
    const seen = new Set<string>();
    const orderedColumns: (keyof T)[] = [];

    for (const column of normalizedColumns.map((item) => item.name)) {
      const key = String(column);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      orderedColumns.push(column);
    }

    for (const column of quickFilterColumns) {
      const key = String(column);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      orderedColumns.push(column);
    }

    return orderedColumns;
  }, [normalizedColumns, quickFilterColumns]);

  function handleSort(column: keyof T) {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const inferColumnType = useCallback(
    (column: keyof T): "boolean" | "text" => {
      const firstValue = data.find(
        (row) => row[column] !== null && row[column] !== undefined,
      )?.[column];
      return typeof firstValue === "boolean" ? "boolean" : "text";
    },
    [data],
  );

  function normalizeFilterValue(
    value: unknown,
    columnType: "boolean" | "text",
  ): string {
    if (columnType === "boolean") {
      return String(Boolean(value));
    }

    const normalized = String(value ?? "").trim();
    return normalized.length === 0 ? "__empty__" : normalized;
  }

  function displayFilterValue(
    value: string,
    columnType: "boolean" | "text",
  ): string {
    if (columnType === "boolean") {
      return value === "true" ? "Yes" : "No";
    }

    return value === "__empty__" ? "(Empty)" : value;
  }

  function setColumnSearchFilter(column: keyof T, value: string) {
    const key = String(column);
    setColumnFilters((prev) => {
      const nextFilter: ColumnFilter = {
        search: value,
        selectedValues: prev[key]?.selectedValues ?? [],
      };
      const hasSearch = nextFilter.search.trim().length > 0;
      const hasSelections = nextFilter.selectedValues.length > 0;

      if (!hasSearch && !hasSelections) {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }

      return {
        ...prev,
        [key]: nextFilter,
      };
    });
  }

  function setColumnValueFilter(
    column: keyof T,
    value: string,
    checked: boolean,
  ) {
    const key = String(column);

    setColumnFilters((prev) => {
      const current = prev[key] ?? { search: "", selectedValues: [] };
      const currentSet = new Set(current.selectedValues);

      if (checked) {
        currentSet.add(value);
      } else {
        currentSet.delete(value);
      }

      const nextFilter: ColumnFilter = {
        search: current.search,
        selectedValues: Array.from(currentSet),
      };
      const hasSearch = nextFilter.search.trim().length > 0;
      const hasSelections = nextFilter.selectedValues.length > 0;

      if (!hasSearch && !hasSelections) {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }

      return {
        ...prev,
        [key]: nextFilter,
      };
    });
  }

  function clearColumnFilter(column: keyof T) {
    const key = String(column);
    setColumnFilters((prev) => {
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }

  const activeFilters = useMemo(
    () =>
      Object.entries(columnFilters).filter(([, filter]) => {
        const hasSearch = filter.search.trim().length > 0;
        const hasSelections = filter.selectedValues.length > 0;
        return hasSearch || hasSelections;
      }),
    [columnFilters],
  );

  const activeQuickFilters = useMemo(
    () =>
      Object.entries(quickFilterValues).filter(
        ([, value]) => value.trim().length > 0,
      ),
    [quickFilterValues],
  );

  const aggregatedColumnValues = useMemo(() => {
    const valueCountsByColumn = new Map<string, Map<string, number>>();

    for (const row of rows) {
      for (const column of filterableColumns) {
        const key = String(column);
        const columnType = inferColumnType(column);
        const normalizedValue = normalizeFilterValue(row[column], columnType);
        const columnValues =
          valueCountsByColumn.get(key) ?? new Map<string, number>();

        columnValues.set(
          normalizedValue,
          (columnValues.get(normalizedValue) ?? 0) + 1,
        );
        valueCountsByColumn.set(key, columnValues);
      }
    }

    return valueCountsByColumn;
  }, [filterableColumns, inferColumnType, rows]);

  const canReorderRows =
    Boolean(reorderRowsProps) &&
    search.trim().length === 0 &&
    !sortColumn &&
    !sortDirection &&
    activeFilters.length === 0 &&
    activeQuickFilters.length === 0;

  const isOrderDirty = useMemo(() => {
    if (!reorderRowsProps || rows.length !== data.length) {
      return false;
    }

    return rows.some((row, index) => row.id !== data[index]?.id);
  }, [data, reorderRowsProps, rows]);

  const processedData = useMemo(() => {
    let result = [...rows];

    if (search.trim()) {
      const lower = search.toLowerCase();
      result = result.filter((row) =>
        normalizedColumns.some((col) =>
          String(row[col.name] ?? "")
            .toLowerCase()
            .includes(lower),
        ),
      );
    }

    if (activeFilters.length > 0) {
      result = result.filter((row) => {
        return activeFilters.every(([columnKey, filterValue]) => {
          const column = normalizedColumns.find(
            (col) => String(col.name) === columnKey,
          );
          if (!column) {
            return true;
          }

          const columnType = inferColumnType(column.name);
          const rowValue = row[column.name];
          const normalizedRowValue = normalizeFilterValue(rowValue, columnType);
          const searchFilter = filterValue.search.trim().toLowerCase();
          const hasValueSelections = filterValue.selectedValues.length > 0;

          if (searchFilter.length > 0) {
            const searchTarget =
              columnType === "boolean"
                ? displayFilterValue(normalizedRowValue, columnType)
                : String(rowValue ?? "");

            if (!searchTarget.toLowerCase().includes(searchFilter)) {
              return false;
            }
          }

          if (hasValueSelections) {
            const selectedSet = new Set(filterValue.selectedValues);
            if (!selectedSet.has(normalizedRowValue)) {
              return false;
            }
          }

          return true;
        });
      });
    }

    if (activeQuickFilters.length > 0) {
      result = result.filter((row) => {
        return activeQuickFilters.every(([columnKey, filterValue]) => {
          const column = filterableColumns.find(
            (col) => String(col) === columnKey,
          );
          if (!column) {
            return true;
          }

          const columnType = inferColumnType(column);
          const normalizedRowValue = normalizeFilterValue(
            row[column],
            columnType,
          );

          return normalizedRowValue === filterValue;
        });
      });
    }

    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aVal = String(a[sortColumn] ?? "");
        const bVal = String(b[sortColumn] ?? "");
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [
    activeFilters,
    activeQuickFilters,
    filterableColumns,
    normalizedColumns,
    rows,
    search,
    sortColumn,
    sortDirection,
    inferColumnType,
  ]);

  function quickFilterOptions(column: keyof T) {
    const columnType = inferColumnType(column);
    const columnKey = String(column);

    // Filter data by other quick filters (but not this column)
    let filteredData = rows;
    if (activeQuickFilters.length > 0) {
      filteredData = rows.filter((row) => {
        return activeQuickFilters.every(([filterColumnKey, filterValue]) => {
          // Skip filtering by this column; we want options for this column
          if (filterColumnKey === columnKey) {
            return true;
          }

          const filterColumn = filterableColumns.find(
            (col) => String(col) === filterColumnKey,
          );
          if (!filterColumn) {
            return true;
          }

          const filterColumnType = inferColumnType(filterColumn);
          const normalizedRowValue = normalizeFilterValue(
            row[filterColumn],
            filterColumnType,
          );

          return normalizedRowValue === filterValue;
        });
      });
    }

    // Build value counts from cascaded filtered data
    const valueCounts = new Map<string, number>();
    for (const row of filteredData) {
      const normalizedValue = normalizeFilterValue(row[column], columnType);
      valueCounts.set(
        normalizedValue,
        (valueCounts.get(normalizedValue) ?? 0) + 1,
      );
    }

    return Array.from(valueCounts.keys()).sort((a, b) => {
      if (columnType === "boolean") {
        if (a === b) return 0;
        if (a === "true") return -1;
        if (b === "true") return 1;
      }

      if (a === "__empty__") return 1;
      if (b === "__empty__") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }

  function reorderRowsById(fromId: T["id"], toId: T["id"]) {
    setRows((prev) => {
      const fromIndex = prev.findIndex((row) => row.id === fromId);
      const toIndex = prev.findIndex((row) => row.id === toId);

      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      if (!reorderRowsProps) {
        return next;
      }

      return next.map((row, index) => ({
        ...row,
        [reorderRowsProps.orderKey]: index,
      }));
    });
  }

  function moveRowByOffset(rowId: T["id"], offset: -1 | 1) {
    setRows((prev) => {
      const currentIndex = prev.findIndex((row) => row.id === rowId);
      if (currentIndex === -1) {
        return prev;
      }

      const targetIndex = currentIndex + offset;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);

      if (!reorderRowsProps) {
        return next;
      }

      return next.map((row, index) => ({
        ...row,
        [reorderRowsProps.orderKey]: index,
      }));
    });
  }

  async function saveOrder() {
    if (!reorderRowsProps || !isOrderDirty || savingOrder) {
      return;
    }

    setSavingOrder(true);
    try {
      const payload = rows.map((row, index) => ({
        id: row.id as T["id"],
        order: Number(row[reorderRowsProps.orderKey] ?? index),
      }));
      const response = await reorderRowsProps.formAction(payload);
      if (response.success) {
        toast.success(response.message);
        return;
      }
      toast.error(response.message);
    } catch {
      toast.error("Unable to save row order");
    } finally {
      setSavingOrder(false);
    }
  }

  function SortIcon({ column }: { column: keyof T }) {
    const isActive = sortColumn === column;
    return (
      <span
        className={cn(
          "ml-1.5 inline-flex flex-col gap-px opacity-40 transition-opacity",
          isActive && "opacity-100",
        )}
        aria-hidden
      >
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          className={cn(
            "fill-current transition-colors",
            isActive && sortDirection === "asc"
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <path d="M4 0L8 5H0L4 0Z" />
        </svg>
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          className={cn(
            "fill-current transition-colors",
            isActive && sortDirection === "desc"
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <path d="M4 5L0 0H8L4 5Z" />
        </svg>
      </span>
    );
  }

  function cell(col: keyof T, row: T) {
    if (typeof row[col] === "boolean") {
      if (updateFormProps?.formAction) {
        return (
          <BooleanToggle
            data={row}
            column={col}
            onCheckChange={updateFormProps.formAction}
          />
        );
      }
      return row[col] ? (
        <span className="text-lime-500">{"Yes"}</span>
      ) : (
        <span className="text-slate-600">{"No"}</span>
      );
    }
    if (col === "color") {
      return (
        <FaSquare
          size={18}
          color={String(row[col])}
        />
      );
    }
    const value = String(row[col] ?? "");
    if (value.includes("\n")) {
      return <span className="whitespace-pre-line leading-5">{value}</span>;
    }
    return value;
  }

  function columnFilterMenu(column: keyof T, display: string) {
    const columnType = inferColumnType(column);
    const key = String(column);
    const hasFilter = key in columnFilters;
    const filter = columnFilters[key] ?? { search: "", selectedValues: [] };
    const valueCounts =
      aggregatedColumnValues.get(key) ?? new Map<string, number>();
    const options = Array.from(valueCounts.entries()).sort(([a], [b]) => {
      if (columnType === "boolean") {
        if (a === b) return 0;
        if (a === "true") return -1;
        if (b === "true") return 1;
      }

      if (a === "__empty__") return 1;
      if (b === "__empty__") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("ml-1", hasFilter && "text-primary")}
            aria-label={`Filter ${display}`}
            onClick={(e) => e.stopPropagation()}
          >
            <FilterIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel>{display} filter</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="px-2 py-1">
            <Input
              value={filter.search}
              onChange={(e) => setColumnSearchFilter(column, e.target.value)}
              className="h-8 text-xs"
              placeholder={`Search ${display}`}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <DropdownMenuSeparator />

          <div className="max-h-56 overflow-y-auto px-1">
            {options.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No values
              </p>
            ) : (
              options.map(([value]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() =>
                    setColumnValueFilter(
                      column,
                      value,
                      !filter.selectedValues.includes(value),
                    )
                  }
                  onSelect={(e) => e.preventDefault()}
                  className="gap-2"
                >
                  <Checkbox
                    checked={filter.selectedValues.includes(value)}
                    className="size-4 border border-border"
                  />
                  <span className="truncate">
                    {displayFilterValue(value, columnType)}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </div>

          {hasFilter && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => clearColumnFilter(column)}>
                Clear filter
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 px-3 pt-5 pb-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <Heading
            className="font-bold"
            level={5}
          >
            {title}
          </Heading>
          {createFormProps && <DataTableCreateForm {...createFormProps} />}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  title="Show/hide columns (DEV) — drag headers to reorder"
                >
                  <Columns3Icon className="mr-1.5 size-3" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-80 overflow-y-auto"
              >
                <DropdownMenuLabel>Show columns (DEV, global)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {displayColumns.map((column) => {
                  const key = String(column.name);
                  const hidden = getHidden(columnFormId, key);
                  return (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => e.preventDefault()}
                      onClick={() => toggleHidden(columnFormId, key)}
                      className="flex items-center gap-2"
                    >
                      {hidden ? (
                        <EyeOffIcon className="size-3.5 text-muted-foreground" />
                      ) : (
                        <EyeIcon className="size-3.5" />
                      )}
                      <span className={cn(hidden && "text-muted-foreground")}>
                        {getLabel(formId, key, column.display)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {reorderRowsProps && isOrderDirty && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={saveOrder}
              disabled={savingOrder}
            >
              {savingOrder ? (
                <>
                  <Loader2Icon className="mr-1.5 size-3 animate-spin" />
                  Saving order
                </>
              ) : (
                <>
                  <CheckIcon className="mr-1.5 size-3" />
                  Save order
                </>
              )}
            </Button>
          )}
          {reorderRowsProps && !canReorderRows && (
            <span className="text-[11px] text-muted-foreground">
              Clear search, sorting, and filters to reorder rows.
            </span>
          )}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path
                d="M21 21l-4.35-4.35"
                strokeLinecap="round"
              />
            </svg>
            <Input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "w-full rounded-lg border border-input bg-background py-1.5 pl-8 pr-3",
                "text-sm text-foreground placeholder:text-muted-foreground",
                "transition-shadow focus:outline-none focus:ring-2 focus:ring-ring",
              )}
            />
          </div>
        </div>
      </div>

      <div className="p-2">
        {quickFilters && quickFilters.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {quickFilters.map((filter) => {
              const key = String(filter.column);
              const selectedValue = quickFilterValues[key] ?? "";
              const options = quickFilterOptions(filter.column);
              const columnType = inferColumnType(filter.column);

              return (
                <div
                  key={key}
                  className="flex min-w-36 flex-col gap-1"
                >
                  <span className="px-1 text-[11px] font-medium leading-none text-muted-foreground">
                    {filter.label}
                  </span>
                  <Select
                    value={selectedValue || "__all__"}
                    onValueChange={(nextValue) => {
                      setQuickFilterValues((previous) => {
                        if (nextValue === "__all__") {
                          const rest = { ...previous };
                          delete rest[key];
                          return rest;
                        }

                        return {
                          ...previous,
                          [key]: nextValue,
                        };
                      });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 min-w-36 text-xs"
                      aria-label={filter.label}
                    >
                      <SelectValue placeholder={`All ${filter.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">
                        {filter.allLabel ?? `All ${filter.label}`}
                      </SelectItem>
                      {options.map((value) => (
                        <SelectItem
                          key={value}
                          value={value}
                        >
                          {displayFilterValue(value, columnType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Table */}
      <div className="max-h-[calc(100vh-220px)] overflow-auto sm:max-h-[calc(100vh-200px)]">
        <table className="w-full min-w-max text-xs">
          <thead className="sticky top-0 bg-muted z-50">
            <tr>
              {reorderRowsProps && (
                <th className="w-20 px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Move
                </th>
              )}
              {visibleColumns.map((column) => (
                <th
                  key={String(column.name)}
                  onClick={() => {
                    // While reordering, a header click is a drag target, not a sort.
                    if (!reorderActive) handleSort(column.name);
                  }}
                  {...colDragProps(String(column.name))}
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-left font-semibold uppercase tracking-wider",
                    "text-muted-foreground select-none cursor-pointer",
                    "transition-colors hover:text-foreground hover:bg-muted",
                    sortColumn === column.name && "text-foreground bg-muted",
                  )}
                >
                  <span className="inline-flex items-center">
                    <span
                      data-form-id={formId}
                      data-form-field-key={String(column.name)}
                      data-form-default-label={column.display}
                    >
                      {getLabel(formId, String(column.name), column.display)}
                    </span>
                    <SortIcon column={column.name} />
                    {columnFilterMenu(column.name, column.display)}
                  </span>
                </th>
              ))}
              {updateFormProps && (
                <th className="whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {processedData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    visibleColumns.length +
                    (updateFormProps ? 1 : 0) +
                    (reorderRowsProps ? 1 : 0)
                  }
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-1">
                    <svg
                      className="mb-1 h-8 w-8 opacity-30"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                      />
                    </svg>
                    No results found
                    {search && (
                      <span className="text-xs">
                        for &ldquo;{search}&rdquo;
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              processedData.map((record: T) => {
                return (
                  <tr
                    key={String(record.id)}
                    draggable={canReorderRows}
                    onDragStart={() => setDraggedRowId(record.id as T["id"])}
                    onDragOver={(event) => {
                      if (!canReorderRows) {
                        return;
                      }
                      event.preventDefault();
                      if (dragOverRowId !== record.id) {
                        setDragOverRowId(record.id as T["id"]);
                      }
                    }}
                    onDrop={(event) => {
                      if (!canReorderRows || !draggedRowId) {
                        return;
                      }
                      event.preventDefault();
                      reorderRowsById(draggedRowId, record.id as T["id"]);
                      setDraggedRowId(null);
                      setDragOverRowId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedRowId(null);
                      setDragOverRowId(null);
                    }}
                    className={cn(
                      "group transition-colors hover:bg-muted/40",
                      draggedRowId === record.id && "opacity-60",
                      dragOverRowId === record.id && "bg-muted/70",
                      canReorderRows && "cursor-move",
                    )}
                  >
                    {reorderRowsProps && (
                      <td className="px-2 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Move row up"
                            disabled={
                              !canReorderRows || rows[0]?.id === record.id
                            }
                            onClick={() =>
                              moveRowByOffset(record.id as T["id"], -1)
                            }
                          >
                            <ArrowUpIcon className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Move row down"
                            disabled={
                              !canReorderRows ||
                              rows[rows.length - 1]?.id === record.id
                            }
                            onClick={() =>
                              moveRowByOffset(record.id as T["id"], 1)
                            }
                          >
                            <ArrowDownIcon className="size-3.5" />
                          </Button>
                          <GripVertical
                            className={cn(
                              "size-3.5",
                              canReorderRows ? "opacity-80" : "opacity-30",
                            )}
                          />
                        </div>
                      </td>
                    )}
                    {visibleColumns.map((column) => (
                      <td
                        key={String(column.name)}
                        className="whitespace-nowrap px-4 py-2.5 text-foreground"
                      >
                        {cell(column.name, record)}
                      </td>
                    ))}
                    {updateFormProps && (
                      <td className="px-2">
                        <DataTableUpdateForm
                          {...updateFormProps}
                          record={record}
                        />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {data.length > 0 && (
        <div className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
          {processedData.length === data.length
            ? `${data.length} row${data.length !== 1 ? "s" : ""}`
            : `${processedData.length} of ${data.length} row${data.length !== 1 ? "s" : ""}`}
        </div>
      )}
    </div>
  );
}
