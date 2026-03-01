"use client";

import { useState, useMemo } from "react";
import { Heading } from "../heading";
import { cn } from "@/lib/utils";
import {
  DataTableCreateForm,
  DataTableCreateFormProps,
} from "./data-table-create-form";
import { ScrollArea } from "../ui/scroll-area";

interface DataTableProps<T> {
  columns: (keyof T)[];
  title: string;
  data: T[];
  createFormProps?: DataTableCreateFormProps<T>;
}

type SortDirection = "asc" | "desc" | null;

export default function DataTable<T>(props: DataTableProps<T>) {
  const { columns, title, data, createFormProps } = props;

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

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 px-5 pt-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Heading
            className="font-bold"
            level={5}
          >
            {title}
          </Heading>
          {createFormProps && <DataTableCreateForm {...createFormProps} />}
        </div>

        <div className="flex items-center gap-2">
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
      <ScrollArea className="h-125">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column as string}
                  onClick={() => handleSort(column)}
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider",
                    "text-muted-foreground select-none cursor-pointer",
                    "transition-colors hover:text-foreground hover:bg-muted",
                    sortColumn === column && "text-foreground bg-muted",
                  )}
                >
                  <span className="inline-flex items-center">
                    {column as string}
                    <SortIcon column={column} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {processedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
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
              processedData.map((row: T, i) => {
                return (
                  <tr
                    key={i}
                    className="group transition-colors hover:bg-muted/40"
                  >
                    {columns.map((column) => (
                      <td
                        key={column as string}
                        className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground"
                      >
                        {String(row[column] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollArea>

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
