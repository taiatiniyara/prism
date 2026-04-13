"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type CustomKpiInput = {
  inputDefId: number;
  dataLabel: string;
};

type CustomKpiRelevanceItem = {
  kpiDefId: number;
  kpiName: string;
  description: string | null;
  formula: string | null;
  isRelevant: boolean;
  utilityIds: number[];
  inputs: CustomKpiInput[];
};

type SetCustomKpiRelevancePayload = {
  kpiDefId: number;
  isRelevant: boolean;
};

export default function CustomKpiRelevanceTable(props: {
  items: CustomKpiRelevanceItem[];
  onToggleRelevance: (
    payload: SetCustomKpiRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [items, setItems] = useState<CustomKpiRelevanceItem[]>(props.items);

  const onItemToggle = (kpiDefId: number, checked: boolean) => {
    const previousItems = items;

    setItems((prev) =>
      prev.map((item) =>
        item.kpiDefId === kpiDefId
          ? {
              ...item,
              isRelevant: checked,
            }
          : item,
      ),
    );

    startTransition(async () => {
      const result = await props.onToggleRelevance({
        kpiDefId,
        isRelevant: checked,
      });

      if (!result.success) {
        setItems(previousItems);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="overflow-auto border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30">
            <th className="border px-4 py-3 text-left font-semibold">KPI</th>
            <th className="border px-4 py-3 text-left font-semibold">
              Formula
            </th>
            <th className="border px-4 py-3 text-left font-semibold">Inputs</th>
            <th className="border px-4 py-3 text-left font-semibold">
              Relevant
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.kpiDefId}>
              <td className="border px-4 py-3 align-top">
                <div className="space-y-1">
                  <p className="font-medium">{item.kpiName}</p>
                  {item.description ? (
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </td>
              <td className="border px-4 py-3 align-top text-muted-foreground">
                {item.formula ? (
                  <code className="whitespace-pre-wrap wrap-break-word text-xs leading-6">
                    {item.formula}
                  </code>
                ) : (
                  <span>No formula configured.</span>
                )}
              </td>
              <td className="border px-4 py-3 text-muted-foreground">
                {item.inputs.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {item.inputs.map((input) => (
                      <li key={`${item.kpiDefId}-${input.inputDefId}`}>
                        {input.dataLabel}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span>No formula inputs configured.</span>
                )}
              </td>
              <td className="border px-4 py-3">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={item.isRelevant}
                    disabled={isSaving}
                    onCheckedChange={(next) =>
                      onItemToggle(item.kpiDefId, next === true)
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    {item.isRelevant ? "Relevant" : "Not relevant"}
                  </span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
