"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import BorderedPanel from "@/components/ui/bordered-panel";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type TransmissionItem = {
  inputDefId: number;
  dataLabel: string;
  isRelevant: boolean;
  dataEntryId: string | null;
};

type SetTransmissionRelevancePayload = {
  reportPeriodId: number;
  serviceAreaId: number;
  inputDefId: number;
  isRelevant: boolean;
};

export default function TransmissionRelevanceTable(props: {
  items: TransmissionItem[];
  reportPeriodId: number;
  serviceAreaId: number;
  onToggleRelevance: (
    payload: SetTransmissionRelevancePayload,
  ) => Promise<{ success: boolean; message: string }>;
}) {
  const [isSaving, startTransition] = useTransition();
  const [items, setItems] = useState<TransmissionItem[]>(props.items);

  const relevantCount = items.filter((item) => item.isRelevant).length;
  const isEntireBlockRelevant =
    items.length > 0 && relevantCount === items.length;

  const onItemToggle = (inputDefId: number, checked: boolean) => {
    const previousItems = items;

    setItems((prev) =>
      prev.map((item) =>
        item.inputDefId === inputDefId
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
          reportPeriodId: props.reportPeriodId,
          serviceAreaId: props.serviceAreaId,
          inputDefId,
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

  const onBlockToggle = (checked: boolean) => {
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
              reportPeriodId: props.reportPeriodId,
              serviceAreaId: props.serviceAreaId,
              inputDefId: item.inputDefId,
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
        if (results.length > 0) {
          toast.success("Relevance updated.");
        }
      })();
    });
  };

  return (
    <BorderedPanel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          variant="outline"
          disabled={isSaving || items.length === 0}
          onClick={() => onBlockToggle(!isEntireBlockRelevant)}
        >
          {isEntireBlockRelevant ? "Uncheck All" : "Check All"}
        </Button>
        <span className="text-xs font-medium">
          {relevantCount}/{items.length} relevant
        </span>
      </div>

      <ul className="space-y-1.5 text-xs">
        {items.map((item) => (
          <li
            key={item.inputDefId}
            className="flex items-center gap-2 leading-5"
          >
            <Checkbox
              checked={item.isRelevant}
              disabled={isSaving}
              onCheckedChange={(next) =>
                onItemToggle(item.inputDefId, next === true)
              }
            />
            <span className="text-muted-foreground">{item.dataLabel}</span>
          </li>
        ))}
      </ul>
    </BorderedPanel>
  );
}
