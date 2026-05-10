"use client";

import { Button } from "@/components/ui/button";
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
  ownerUserId: string | null;
  ownerUserName: string | null;
  ownerUserOrgAcronym: string | null;
  ownerUtilityId: number | null;
  ownerUtilityName: string | null;
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
  const isAllRelevant =
    items.length > 0 && items.every((item) => item.isRelevant);

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

    startTransition(() => {
      void (async () => {
        const loadingToastId = toast.loading("Updating relevance...");
        const result = await props.onToggleRelevance({
          kpiDefId,
          isRelevant: checked,
        });

        if (!result.success) {
          setItems(previousItems);
          toast.error(result.message);
          toast.dismiss(loadingToastId);
          return;
        }

        toast.dismiss(loadingToastId);
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
            props.onToggleRelevance({
              kpiDefId: item.kpiDefId,
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

        toast.dismiss(loadingToastId);
        toast.success(checked ? "Checked all." : "Unchecked all.");
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

      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((item) => (
          <section
            key={item.kpiDefId}
            className={`rounded-lg border bg-card p-4 shadow-sm ${
              item.isRelevant ? "border-lime-300" : "border-border"
            }`}
            aria-label={`Custom KPI relevance for ${item.kpiName}`}
          >
            <div className="space-y-1">
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <Checkbox
                  checked={item.isRelevant}
                  disabled={isSaving}
                  onCheckedChange={(next) =>
                    onItemToggle(item.kpiDefId, next === true)
                  }
                />
                <span>{item.kpiName}</span>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                Added by:{" "}
                {item.ownerUserName ?? item.ownerUtilityName ?? "Unknown user"}
                {item.ownerUserName && item.ownerUserOrgAcronym
                  ? ` | ${item.ownerUserOrgAcronym}`
                  : ""}
              </p>
              {item.description ? (
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="space-y-1 rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Formula
                </p>
                {item.formula ? (
                  <code className="whitespace-pre-wrap wrap-break-word text-xs leading-6 text-muted-foreground">
                    {item.formula}
                  </code>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No formula configured.
                  </p>
                )}
              </div>

              <div className="space-y-1 rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Inputs
                </p>
                {item.inputs.length > 0 ? (
                  <ul className="space-y-1">
                    {item.inputs.map((input) => (
                      <li
                        key={`${item.kpiDefId}-${input.inputDefId}`}
                        className="rounded border border-muted bg-muted/20 px-2 py-1 text-xs text-foreground"
                      >
                        {input.dataLabel}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No formula inputs configured.
                  </p>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
