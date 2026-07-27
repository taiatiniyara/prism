"use client";

import { GetAllManagedLists } from "@/app/settings/managed-lists/service";
import {
  DataEntrySelect,
  type DataEntrySelectOption,
} from "@/components/data-entry/dataEntrySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";

type AlternativeNameRow = {
  id: string;
  sourceId: string;
  label: string;
};

const makeRow = (sourceId = "", label = ""): AlternativeNameRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sourceId,
  label,
});

const parseInitialValue = (value: unknown): AlternativeNameRow[] => {
  if (!value) {
    return [];
  }

  let parsed: unknown = value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  return Object.entries(parsed)
    .filter(([key, rawLabel]) => {
      return key.trim().length > 0 && typeof rawLabel === "string";
    })
    .map(([sourceId, rawLabel]) => makeRow(sourceId, rawLabel.trim()))
    .filter((row) => row.label.length > 0);
};

const buildPayload = (rows: AlternativeNameRow[]): string => {
  const payload = rows.reduce<Record<string, string>>((acc, row) => {
    const sourceId = row.sourceId.trim();
    const label = row.label.trim();

    if (!sourceId || !label) {
      return acc;
    }

    acc[sourceId] = label;
    return acc;
  }, {});

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : "";
};

export default function InputAlternativeNamesEditor(props: {
  inputName: string;
  value?: unknown;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<AlternativeNameRow[]>(() =>
    parseInitialValue(props.value),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [options, setOptions] = useState<DataEntrySelectOption[]>([]);

  useEffect(() => {
    let isCancelled = false;

    GetAllManagedLists({
      name: "Technology",
    })
      .then((res) => {
        if (isCancelled) {
          return;
        }

        const items = (res?.[0]?.items ?? []).filter(
          (item) => item.is_active && !item.name.toLowerCase().includes("all"),
        );

        setOptions(
          items.map((item) => ({
            value: String(item.id),
            label: item.name,
          })),
        );
      })
      .catch(() => {
        if (!isCancelled) {
          setOptions([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const payload = useMemo(() => buildPayload(rows), [rows]);

  const addRow = () => {
    setRows((previous) => [...previous, makeRow()]);
  };

  const removeRow = (id: string) => {
    setRows((previous) => previous.filter((row) => row.id !== id));
  };

  const updateRow = (
    id: string,
    patch: Partial<Pick<AlternativeNameRow, "sourceId" | "label">>,
  ) => {
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  return (
    <div className="space-y-2">
      <input
        type="hidden"
        name={props.inputName}
        value={payload}
      />

      {isLoading ? (
        <Skeleton className="h-9 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No overrides set. Add rows to define source-specific display names.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_1fr_auto]"
          >
            <DataEntrySelect
              name={`${props.inputName}-source-${row.id}`}
              value={row.sourceId || undefined}
              disabled={props.disabled}
              placeholder="Energy source"
              triggerClassName="rounded-md border border-input"
              options={options}
              onValueChange={(nextValue) =>
                updateRow(row.id, { sourceId: nextValue })
              }
            />
            <Input
              disabled={props.disabled}
              value={row.label}
              onChange={(event) =>
                updateRow(row.id, { label: event.target.value })
              }
              placeholder="Display name"
            />
            <Button
              type="button"
              variant="outline"
              disabled={props.disabled}
              onClick={() => removeRow(row.id)}
            >
              Remove
            </Button>
          </div>
        ))
      )}

      <Button
        type="button"
        variant="secondary"
        disabled={props.disabled || isLoading || options.length === 0}
        onClick={addRow}
      >
        Add Alternative Name
      </Button>

      <p className="text-xs text-muted-foreground">
        Each row maps one energy source to a custom display name.
      </p>
    </div>
  );
}
