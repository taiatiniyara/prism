"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type DevInputRelevanceItem = {
  id: number;
  inputDefId: number;
  inputDef: string;
  dimensionId: number;
  dimension: string;
  isRelevant: boolean;
};

type DevInputRelevanceOption = {
  id: number;
  name: string;
};

function SearchableSelect(props: {
  options: DevInputRelevanceOption[];
  value?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filteredOptions = props.options.filter((option) =>
    option.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Select
      disabled={props.disabled}
      value={props.value}
      onValueChange={(value) => {
        props.onValueChange(value);
        setSearch("");
      }}
    >
      <SelectTrigger className={props.className ?? "w-full min-w-72"}>
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div className="p-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") {
                event.stopPropagation();
              }
            }}
            onKeyUp={(event) => {
              if (event.key !== "Escape") {
                event.stopPropagation();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={props.searchPlaceholder}
            className="h-8"
          />
        </div>
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id.toString()}
            >
              {option.name}
            </SelectItem>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {props.emptyLabel}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

export default function DevInputRelevanceTable(props: {
  items: DevInputRelevanceItem[];
  inputOptions: DevInputRelevanceOption[];
  dimensionOptions: DevInputRelevanceOption[];
  onAddItem: (payload: {
    inputDefId: number;
    dimensionId: number;
    isRelevant: boolean;
  }) => Promise<{
    success: boolean;
    message: string;
    item?: DevInputRelevanceItem;
  }>;
  onUpdateItem: (payload: {
    id: number;
    inputDefId: number;
    dimensionId: number;
    isRelevant: boolean;
  }) => Promise<{
    success: boolean;
    message: string;
    item?: DevInputRelevanceItem;
  }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [items, setItems] = useState<DevInputRelevanceItem[]>(props.items);
  const [newItem, setNewItem] = useState<{
    inputDefId: number | null;
    dimensionId: number | null;
    isRelevant: boolean;
  }>({
    inputDefId: null,
    dimensionId: null,
    isRelevant: true,
  });

  const inputNameById = new Map(
    props.inputOptions.map((option) => [option.id, option.name]),
  );
  const dimensionNameById = new Map(
    props.dimensionOptions.map((option) => [option.id, option.name]),
  );

  const onAddRow = () => {
    if (newItem.inputDefId == null || newItem.dimensionId == null) {
      toast.error("Select both Input and Dimension before adding.");
      return;
    }

    const inputDefId = newItem.inputDefId;
    const dimensionId = newItem.dimensionId;

    startTransition(async () => {
      const result = await props.onAddItem({
        inputDefId,
        dimensionId,
        isRelevant: newItem.isRelevant,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      if (result.item) {
        setItems((prev) => [result.item as DevInputRelevanceItem, ...prev]);
      }

      setNewItem({
        inputDefId: null,
        dimensionId: null,
        isRelevant: true,
      });

      toast.success(result.message);
    });
  };

  const updateDraft = (
    id: number,
    patch: Partial<
      Pick<DevInputRelevanceItem, "inputDefId" | "dimensionId" | "isRelevant">
    >,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const onUpdateRow = (id: number) => {
    const row = items.find((item) => item.id === id);

    if (!row) {
      toast.error("Row not found.");
      return;
    }

    const previousItems = items;

    startTransition(async () => {
      const result = await props.onUpdateItem({
        id,
        inputDefId: row.inputDefId,
        dimensionId: row.dimensionId,
        isRelevant: row.isRelevant,
      });

      if (!result.success) {
        setItems(previousItems);
        toast.error(result.message);
        return;
      }

      if (result.item) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? (result.item as DevInputRelevanceItem) : item,
          ),
        );
      }

      toast.success(result.message);
    });
  };

  return (
    <div className="max-h-[70vh] overflow-auto border">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30">
            <th className="sticky left-0 top-0 z-40 min-w-72 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap">
              Input
            </th>
            <th className="sticky top-0 z-30 min-w-72 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap">
              Dimension
            </th>
            <th className="sticky top-0 z-30 min-w-40 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap">
              Relevant
            </th>
            <th className="sticky top-0 z-30 min-w-40 border bg-muted px-5 py-3 text-left text-sm font-semibold whitespace-nowrap">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/10">
            <td className="sticky left-0 z-20 border bg-background px-5 py-4 align-top">
              <SearchableSelect
                disabled={isSaving}
                options={props.inputOptions}
                value={newItem.inputDefId?.toString()}
                placeholder="Select input"
                searchPlaceholder="Search inputs"
                emptyLabel="No inputs found."
                onValueChange={(value) =>
                  setNewItem((prev) => ({ ...prev, inputDefId: Number(value) }))
                }
              />
            </td>
            <td className="border px-5 py-4 align-top">
              <SearchableSelect
                disabled={isSaving}
                options={props.dimensionOptions}
                value={newItem.dimensionId?.toString()}
                placeholder="Select dimension"
                searchPlaceholder="Search dimensions"
                emptyLabel="No dimensions found."
                onValueChange={(value) =>
                  setNewItem((prev) => ({
                    ...prev,
                    dimensionId: Number(value),
                  }))
                }
              />
            </td>
            <td className="border px-5 py-4 align-top">
              <Checkbox
                checked={newItem.isRelevant}
                disabled={isSaving}
                onCheckedChange={(next) =>
                  setNewItem((prev) => ({
                    ...prev,
                    isRelevant: next === true,
                  }))
                }
              />
            </td>
            <td className="border px-5 py-4 align-top">
              <Button
                size="sm"
                disabled={isSaving}
                onClick={onAddRow}
              >
                Add
              </Button>
            </td>
          </tr>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="sticky left-0 z-20 border bg-background px-5 py-4 align-top">
                <SearchableSelect
                  disabled={isSaving}
                  options={props.inputOptions}
                  value={item.inputDefId.toString()}
                  placeholder={
                    inputNameById.get(item.inputDefId) ?? "Select input"
                  }
                  searchPlaceholder="Search inputs"
                  emptyLabel="No inputs found."
                  onValueChange={(value) =>
                    updateDraft(item.id, { inputDefId: Number(value) })
                  }
                />
              </td>
              <td className="border px-5 py-4 align-top">
                <SearchableSelect
                  disabled={isSaving}
                  options={props.dimensionOptions}
                  value={item.dimensionId.toString()}
                  placeholder={
                    dimensionNameById.get(item.dimensionId) ??
                    "Select dimension"
                  }
                  searchPlaceholder="Search dimensions"
                  emptyLabel="No dimensions found."
                  onValueChange={(value) =>
                    updateDraft(item.id, { dimensionId: Number(value) })
                  }
                />
              </td>
              <td className="border px-5 py-4 align-top">
                <Checkbox
                  checked={item.isRelevant}
                  disabled={isSaving}
                  onCheckedChange={(next) =>
                    updateDraft(item.id, { isRelevant: next === true })
                  }
                />
              </td>
              <td className="border px-5 py-4 align-top">
                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={() => onUpdateRow(item.id)}
                >
                  Update
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
