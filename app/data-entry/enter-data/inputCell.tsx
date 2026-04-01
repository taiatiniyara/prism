"use client";

import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { CheckedState } from "@radix-ui/react-checkbox";

import {
  updateDataEntryAvailabilityAction,
  updateDataEntryCommentAction,
  updateDataEntryValueAction,
} from "@/app/data-entry/enter-data/service";
import { DataEntryInputRowView } from "@/app/data-entry/types";
import ManagedListInput from "@/components/tables/managed-list-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface InputCellProps {
  row: DataEntryInputRowView;
}

export default function InputCell({ row }: InputCellProps) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const [commentDraft, setCommentDraft] = useState("");
  const [isDataNotAvailable, setIsDataNotAvailable] = useState(
    row.isDataNotAvailable ?? false,
  );
  const displayValue = row.value ?? "";

  useEffect(() => {
    setIsDataNotAvailable(row.isDataNotAvailable ?? false);
  }, [row.isDataNotAvailable]);

  const existingComments = useMemo(() => {
    if (!row.comments) {
      return [] as { comment: string }[];
    }

    try {
      const parsed = JSON.parse(row.comments) as Array<{ comment?: unknown }>;
      return parsed
        .filter((item) => typeof item?.comment === "string")
        .map((item) => ({ comment: String(item.comment) }));
    } catch {
      return [] as { comment: string }[];
    }
  }, [row.comments]);

  const handleCommitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    persistValue(event.currentTarget.value);
    event.currentTarget.blur();
  };

  const persistValue = (nextValue: string) => {
    const normalizedCurrent = (row.value ?? "").trim();
    const normalizedNext = nextValue.trim();

    if (normalizedCurrent === normalizedNext) {
      return;
    }

    startTransition(async () => {
      const loadingToastId = toast.loading(
        "Saving value and recalculating KPI...",
      );

      try {
        await updateDataEntryValueAction({
          inputDefId: row.inputDefId,
          energyResourceId: row.energyResourceId ?? null,
          value: nextValue,
        });

        router.refresh();

        toast.success("Data update was successful.", {
          id: loadingToastId,
        });
      } catch {
        toast.error("Failed to save value or recalculate KPI.", {
          id: loadingToastId,
        });
      }
    });
  };

  const persistDataNotAvailable = (checked: boolean) => {
    if (isSaving || checked === isDataNotAvailable) {
      return;
    }

    const previousValue = isDataNotAvailable;
    setIsDataNotAvailable(checked);

    startTransition(async () => {
      const loadingToastId = toast.loading("Updating availability status...");

      try {
        await updateDataEntryAvailabilityAction({
          inputDefId: row.inputDefId,
          energyResourceId: row.energyResourceId ?? null,
          isDataNotAvailable: checked,
        });

        router.refresh();

        toast.success("Availability status updated.", {
          id: loadingToastId,
        });
      } catch {
        setIsDataNotAvailable(previousValue);
        toast.error("Failed to update availability status.", {
          id: loadingToastId,
        });
      }
    });
  };

  const persistComment = (
    nextComment?: string,
    options?: { showEmptyToast?: boolean },
  ) => {
    const normalized = (nextComment ?? commentDraft).trim();

    if (isSaving) {
      return;
    }

    if (normalized.length === 0) {
      if (options?.showEmptyToast !== false) {
        toast.error("Please enter a comment before saving.");
      }
      return;
    }

    startTransition(async () => {
      const loadingToastId = toast.loading("Saving comment...");

      try {
        await updateDataEntryCommentAction({
          inputDefId: row.inputDefId,
          energyResourceId: row.energyResourceId ?? null,
          comment: normalized,
        });

        setCommentDraft("");
        router.refresh();

        toast.success("Comment saved.", {
          id: loadingToastId,
        });
      } catch {
        toast.error("Failed to save comment.", {
          id: loadingToastId,
        });
      }
    });
  };

  const handleCommentOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    persistComment(event.currentTarget.value, { showEmptyToast: false });
    event.currentTarget.blur();
  };

  const inputDisabled = isSaving || isDataNotAvailable;

  const inputControl = (() => {
    switch (row.controlType) {
      case "number":
        return (
          <Input
            className={`${
              row.value ? "border-l-lime-300" : "border-l-red-200"
            } border border-l-7 w-full rounded-l-none`}
            type="number"
            defaultValue={displayValue}
            disabled={inputDisabled}
            name={row.inputName}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "boolean":
        return (
          <select
            className={`border shadow w-full rounded-lg ${
              row.value ? "bg-lime-100 border-lime-500" : "bg-slate-100"
            }`}
            defaultValue={displayValue}
            disabled={inputDisabled}
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
            disabled={inputDisabled}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "select":
        return (
          <Input
            defaultValue={displayValue}
            disabled={inputDisabled}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "text":
        return (
          <Input
            defaultValue={displayValue}
            disabled={inputDisabled}
            onKeyDown={handleCommitOnEnter}
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
            disabled={inputDisabled}
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
  })();

  const latestComment = existingComments.at(-1)?.comment;
  const updatedByLabel = [row.updatedByName, row.updatedByRole]
    .filter((value): value is string =>
      Boolean(value && value.trim().length > 0),
    )
    .join(" - ");
  const updatedAtLabel = useMemo(() => {
    if (!row.updatedAt) {
      return null;
    }

    const date = new Date(row.updatedAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }, [row.updatedAt]);

  const updatedMetaLabel = [updatedByLabel, updatedAtLabel]
    .filter((value): value is string =>
      Boolean(value && value.trim().length > 0),
    )
    .join(" on ");

  return (
    <div className="space-y-2 border p-4 rounded-lg bg-white shadow-md">
      {inputControl}
      {latestComment ? (
        <p className="text-[11px] text-muted-foreground line-clamp-2">
          Latest comment: {latestComment}
        </p>
      ) : null}
      <Textarea
        value={commentDraft}
        onChange={(event) => setCommentDraft(event.target.value)}
        onKeyDown={handleCommentOnEnter}
        onBlur={(event) =>
          persistComment(event.currentTarget.value, {
            showEmptyToast: false,
          })
        }
        placeholder="Add comment"
        disabled={isSaving || isDataNotAvailable}
        className="min-h-16 text-xs"
      />
      <div className="mt-4 flex items-center justify-between">
        <label
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${
            isDataNotAvailable ? "text-amber-600" : "text-slate-500"
          } ${isSaving ? "" : "cursor-pointer"}`}
        >
          <Checkbox
            checked={isDataNotAvailable}
            disabled={isSaving}
            onCheckedChange={(checked: CheckedState) => {
              persistDataNotAvailable(checked === true);
            }}
            className="size-5"
          />
          <span>Data Not Available</span>
        </label>
        {updatedMetaLabel ? (
          <p className="text-[11px] text-muted-foreground px-1">
            <b>Updated by:</b> <br /> {updatedMetaLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
