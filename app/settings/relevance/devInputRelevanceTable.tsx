"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useMemo, useState, useTransition } from "react";
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
  const inputSelectOptions = useMemo(
    () =>
      props.inputOptions.map((option) => ({
        value: option.id.toString(),
        label: option.name,
      })),
    [props.inputOptions],
  );
  const dimensionSelectOptions = useMemo(
    () =>
      props.dimensionOptions.map((option) => ({
        value: option.id.toString(),
        label: option.name,
      })),
    [props.dimensionOptions],
  );
  const isAllRelevant =
    items.length > 0 && items.every((item) => item.isRelevant);

  const onAddRow = () => {
    if (newItem.inputDefId == null || newItem.dimensionId == null) {
      toast.error("Select both Input and Dimension before adding.");
      return;
    }

    const inputDefId = newItem.inputDefId;
    const dimensionId = newItem.dimensionId;

    startTransition(() => {
      void (async () => {
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
      })();
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

    startTransition(() => {
      void (async () => {
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
      })();
    });
  };

  const onToggleAll = (checked: boolean) => {
    if (items.length === 0) {
      return;
    }

    const previousItems = items;

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        isRelevant: checked,
      })),
    );

    startTransition(() => {
      void (async () => {
        const loadingToastId = toast.loading("Updating relevance...");
        const results = await Promise.all(
          items.map((item) =>
            props.onUpdateItem({
              id: item.id,
              inputDefId: item.inputDefId,
              dimensionId: item.dimensionId,
              isRelevant: checked,
            }),
          ),
        );

        const failedResult = results.find((result) => !result.success);

        if (failedResult) {
          setItems(previousItems);
          toast.error(failedResult.message);
          toast.dismiss(loadingToastId);
          return;
        }

        const updatedItems = results
          .map((result) => result.item)
          .filter((item): item is DevInputRelevanceItem => item != null);

        if (updatedItems.length === items.length) {
          const itemById = new Map(updatedItems.map((item) => [item.id, item]));
          setItems((prev) => prev.map((item) => itemById.get(item.id) ?? item));
        }

        toast.dismiss(loadingToastId);
        toast.success("Relevance updated.");
      })();
    });
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isSaving || items.length === 0}
        onClick={() => onToggleAll(!isAllRelevant)}
      >
        {isAllRelevant ? "Uncheck All" : "Check All"}
      </Button>

      <div className="max-h-[70vh] overflow-auto border">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/30">
              <th className="sticky left-0 top-0 z-40 min-w-56 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">
                Input
              </th>
              <th className="sticky top-0 z-30 min-w-56 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">
                Dimension
              </th>
              <th className="sticky top-0 z-30 min-w-32 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">
                Relevant
              </th>
              <th className="sticky top-0 z-30 min-w-32 border bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-muted/10">
              <td className="sticky left-0 z-20 border bg-background px-3 py-2 align-top">
                <SearchableSelect
                  disabled={isSaving}
                  options={inputSelectOptions}
                  value={newItem.inputDefId?.toString()}
                  placeholder="Select input"
                  searchPlaceholder="Search inputs"
                  emptyLabel="No inputs found."
                  triggerClassName="w-full min-w-56 text-xs"
                  contentClassName="min-w-56"
                  onValueChange={(value) =>
                    setNewItem((prev) => ({
                      ...prev,
                      inputDefId: Number(value),
                    }))
                  }
                />
              </td>
              <td className="border px-3 py-2 align-top">
                <SearchableSelect
                  disabled={isSaving}
                  options={dimensionSelectOptions}
                  value={newItem.dimensionId?.toString()}
                  placeholder="Select dimension"
                  searchPlaceholder="Search dimensions"
                  emptyLabel="No dimensions found."
                  triggerClassName="w-full min-w-56 text-xs"
                  contentClassName="min-w-56"
                  onValueChange={(value) =>
                    setNewItem((prev) => ({
                      ...prev,
                      dimensionId: Number(value),
                    }))
                  }
                />
              </td>
              <td className="border px-3 py-2 align-top">
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
              <td className="border px-3 py-2 align-top">
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isSaving}
                  onClick={onAddRow}
                >
                  Add
                </Button>
              </td>
            </tr>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="sticky left-0 z-20 border bg-background px-3 py-2 align-top">
                  <SearchableSelect
                    disabled={isSaving}
                    options={inputSelectOptions}
                    value={item.inputDefId.toString()}
                    placeholder={
                      inputNameById.get(item.inputDefId) ?? "Select input"
                    }
                    searchPlaceholder="Search inputs"
                    emptyLabel="No inputs found."
                    triggerClassName="w-full min-w-56 text-xs"
                    contentClassName="min-w-56"
                    onValueChange={(value) =>
                      updateDraft(item.id, { inputDefId: Number(value) })
                    }
                  />
                </td>
                <td className="border px-3 py-2 align-top">
                  <SearchableSelect
                    disabled={isSaving}
                    options={dimensionSelectOptions}
                    value={item.dimensionId.toString()}
                    placeholder={
                      dimensionNameById.get(item.dimensionId) ??
                      "Select dimension"
                    }
                    searchPlaceholder="Search dimensions"
                    emptyLabel="No dimensions found."
                    triggerClassName="w-full min-w-56 text-xs"
                    contentClassName="min-w-56"
                    onValueChange={(value) =>
                      updateDraft(item.id, { dimensionId: Number(value) })
                    }
                  />
                </td>
                <td className="border px-3 py-2 align-top">
                  <Checkbox
                    checked={item.isRelevant}
                    disabled={isSaving}
                    onCheckedChange={(next) =>
                      updateDraft(item.id, { isRelevant: next === true })
                    }
                  />
                </td>
                <td className="border px-3 py-2 align-top">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
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
    </div>
  );
}
