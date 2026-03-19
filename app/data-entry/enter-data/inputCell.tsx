"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateDataEntryValueAction } from "@/app/data-entry/enter-data/service";
import { DataEntryInputRowView } from "@/app/data-entry/types";
import ManagedListInput from "@/components/tables/managed-list-input";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface InputCellProps {
  row: DataEntryInputRowView;
}

export default function InputCell({ row }: InputCellProps) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const displayValue = row.value ?? "";

  const persistValue = (nextValue: string) => {
    const normalizedCurrent = (row.value ?? "").trim();
    const normalizedNext = nextValue.trim();

    if (normalizedCurrent === normalizedNext) {
      return;
    }

    startTransition(async () => {
      await updateDataEntryValueAction({
        inputDefId: row.inputDefId,
        energyResourceId: row.energyResourceId ?? null,
        value: nextValue,
      });
      router.refresh();
      toast.success("Value updated successfully");
    });
  };

  switch (row.controlType) {
    case "number":
      return (
        <Input
          className={`${
            row.value ? "border-l-lime-200" : "border-l-red-200"
          } border-l-8 p-2.5 w-full rounded-lg`}
          type="number"
          defaultValue={displayValue}
          disabled={isSaving}
          name={row.inputName}
          onBlur={(event) => persistValue(event.target.value)}
        />
      );
    case "boolean":
      return (
        <select
          className={`border-l-8 p-2.5 w-full rounded-lg ${
            row.value ? "border-l-lime-200" : "border-l-red-200"
          }`}
          defaultValue={displayValue}
          disabled={isSaving}
          onChange={(event) => {
            const nextValue = event.target.value;
            persistValue(nextValue);
          }}
        >
          <option value="">-- Select --</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      );
    case "date":
      return (
        <Input
          type="date"
          defaultValue={displayValue}
          disabled={isSaving}
          onBlur={(event) => persistValue(event.target.value)}
        />
      );
    case "select":
      return (
        <Input
          defaultValue={displayValue}
          disabled={isSaving}
          onBlur={(event) => persistValue(event.target.value)}
        />
      );
    case "text":
      return (
        <Input
          defaultValue={displayValue}
          disabled={isSaving}
          onBlur={(event) => persistValue(event.target.value)}
        />
      );
    case "managedLists":
      return (
        <ManagedListInput
          managedListName={row.inputName}
          inputName={`input_${row.inputDefId}`}
          valueName={displayValue}
          hasValue={Boolean(row.value)}
          disabled={isSaving}
          onValueNameChange={(selectedName) => persistValue(selectedName)}
        />
      );
    case "fallback":
    default:
      return (
        <span className="text-amber-700">
          {displayValue || "Unsupported data type"}
        </span>
      );
  }
}
