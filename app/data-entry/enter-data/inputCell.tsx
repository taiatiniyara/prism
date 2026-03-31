"use client";

import { KeyboardEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updateDataEntryCommentAction,
  updateDataEntryValueAction,
} from "@/app/data-entry/enter-data/service";
import { DataEntryInputRowView } from "@/app/data-entry/types";
import ManagedListInput from "@/components/tables/managed-list-input";
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
  const displayValue = row.value ?? "";
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

  const inputControl = (() => {
    switch (row.controlType) {
      case "number":
        return (
          <Input
            className={`${
              row.value ? "bg-lime-100 border-lime-500" : "bg-slate-100"
            } border w-full rounded-lg`}
            type="number"
            defaultValue={displayValue}
            disabled={isSaving}
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
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "select":
        return (
          <Input
            defaultValue={displayValue}
            disabled={isSaving}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "text":
        return (
          <Input
            defaultValue={displayValue}
            disabled={isSaving}
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
  })();

  const latestComment = existingComments.at(-1)?.comment;

  return (
    <div className="space-y-2">
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
        disabled={isSaving}
        className="min-h-16 text-xs"
      />
    </div>
  );
}
