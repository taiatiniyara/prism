"use client";

import { useState, useMemo } from "react";
import { Heading } from "../heading";
import { cn } from "@/lib/utils";
import {
  DataTableCreateForm,
  DataTableCreateFormProps,
  DataTableFormResponse,
  FieldType,
} from "./data-table-create-form";

import DataTableUpdateForm from "./data-table-update-form";
import { formatLabel } from "@/lib/formatters";
import BooleanToggle from "./booleanToggle";
import { FaSquare } from "react-icons/fa";

interface DataTableProps<T> {
  columns: (keyof T)[];
  title: string;
  data: T[];
  createFormProps?: DataTableCreateFormProps<T>;
  updateFormProps?: {
    formAction: (body: Partial<T>) => Promise<DataTableFormResponse<T>>;
    fields: {
      key: keyof T;
      type: FieldType;
      selectList?: {
        label: string;
        value: string | number;
      }[];
      managedListName?: string;
    }[];
  };
}

type SortDirection = "asc" | "desc" | null;

export default function DataTable<T>(props: DataTableProps<T>) {
  const { columns, title, data, createFormProps, updateFormProps } = props;

  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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

  const processedData = useMemo(() => {
    let result = [...data];

    if (search.trim()) {
      const lower = search.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) =>
          String(row[col] ?? "")
            .toLowerCase()
            .includes(lower),
        ),
      );
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
  }, [data, search, sortColumn, sortDirection, columns]);

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
    return String(row[col] ?? "");
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
            <input
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

      {/* Table */}
      <div className="max-h-[calc(100vh-220px)] overflow-auto sm:max-h-[calc(100vh-200px)]">
        <table className="w-full min-w-max text-xs">
          <thead className="sticky top-0 bg-muted z-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column as string}
                  onClick={() => handleSort(column)}
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-left font-semibold uppercase tracking-wider",
                    "text-muted-foreground select-none cursor-pointer",
                    "transition-colors hover:text-foreground hover:bg-muted",
                    sortColumn === column && "text-foreground bg-muted",
                  )}
                >
                  <span className="inline-flex items-center">
                    {formatLabel(column as string)}
                    <SortIcon column={column} />
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
                  colSpan={columns.length + (updateFormProps ? 1 : 0)}
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
              processedData.map((record: T, i) => {
                return (
                  <tr
                    key={i}
                    className="group transition-colors hover:bg-muted/40"
                  >
                    {columns.map((column) => (
                      <td
                        key={column as string}
                        className="whitespace-nowrap px-4 py-2.5 text-foreground"
                      >
                        {cell(column, record)}
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
