"use client";

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

    startTransition(async () => {
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

    startTransition(async () => {
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
        toast.success("Transmission relevance updated.");
      }
    });
  };

  return (
    <BorderedPanel className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={isEntireBlockRelevant}
            disabled={isSaving || items.length === 0}
            onCheckedChange={(next) => onBlockToggle(next === true)}
          />
          <span>Entire transmission block</span>
        </label>
        <span className="text-sm font-medium">
          {relevantCount}/{items.length} relevant
        </span>
      </div>

      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li
            key={item.inputDefId}
            className="flex items-center gap-3 leading-6"
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
