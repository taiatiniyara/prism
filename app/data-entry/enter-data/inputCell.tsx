"use client";

import { KeyboardEvent, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckedState } from "@radix-ui/react-checkbox";

import {
  updateDataEntryAvailabilityAction,
  updateDataEntryCommentAction,
  updateDataEntryValueAction,
} from "@/app/data-entry/enter-data/service";
import { DataEntryInputRowView } from "@/app/data-entry/types";
import { DataEntrySelect } from "@/components/data-entry/dataEntrySelect";
import DataEntryManagedListInput from "@/components/data-entry/managed-list-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";

interface InputCellProps {
  row: DataEntryInputRowView;
}

const DRAFT_STORAGE_PREFIX = "prism:draft:";

const getDraftKey = (row: DataEntryInputRowView): string =>
  `${DRAFT_STORAGE_PREFIX}${row.inputDefId}:${row.energyResourceId ?? "na"}:${row.paymentModeId ?? "na"}:${row.customerTypeId ?? "na"}`;

const readDraft = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeDraft = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable
  }
};

const removeDraft = (key: string): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage unavailable
  }
};

export default function InputCell({ row }: InputCellProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedValue, setLastSavedValue] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isDataNotAvailable, setIsDataNotAvailable] = useState(
    row.isDataNotAvailable ?? false,
  );
  const [isCommentSaving, setIsCommentSaving] = useState(false);
  const [localComments, setLocalComments] = useState<
    { comment: string }[] | null
  >(null);
  const valueInputRef = useRef<HTMLInputElement | null>(null);
  const draftKey = useMemo(() => getDraftKey(row), [row]);

  const draftValue = useMemo(() => {
    const draft = readDraft(draftKey);
    return draft ?? "";
  }, [draftKey]);

  const displayValue = draftValue || (row.value ?? "");

  const existingComments = useMemo(() => {
    if (localComments) return localComments;
    if (!row.comments) return [] as { comment: string }[];
    try {
      const parsed = JSON.parse(row.comments) as Array<{ comment?: unknown }>;
      return parsed
        .filter((item) => typeof item?.comment === "string")
        .map((item) => ({ comment: String(item.comment) }));
    } catch {
      return [] as { comment: string }[];
    }
  }, [row.comments, localComments]);

  const handleCommitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    persistValue(event.currentTarget.value);
    event.currentTarget.blur();
  };

  const persistValue = useCallback(
    (nextValue: string) => {
      const normalizedCurrent = (row.value ?? "").trim();
      const normalizedNext = nextValue.trim();

      if (normalizedCurrent === normalizedNext) {
        removeDraft(draftKey);
        return;
      }

      writeDraft(draftKey, nextValue);
      setIsSaving(true);
      setSaveError(null);

      const loadingToastId = toast.loading(
        "Saving value and recalculating KPI...",
      );

      updateDataEntryValueAction({
        inputDefId: row.inputDefId,
        energyResourceId: row.energyResourceId ?? null,
        customerTypeId: row.customerTypeId ?? null,
        paymentModeId: row.paymentModeId ?? null,
        value: nextValue,
      })
        .then(() => {
          removeDraft(draftKey);
          setLastSavedValue(nextValue);
          setSaveError(null);
          router.refresh();
          toast.success("Data update was successful.", {
            id: loadingToastId,
          });
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to save value or recalculate KPI.";
          setSaveError(message);
          toast.error(message, {
            id: loadingToastId,
            duration: 6000,
          });
        })
        .finally(() => {
          setIsSaving(false);
        });
    },
    [row, draftKey, router],
  );

  const retrySave = useCallback(() => {
    if (valueInputRef.current) {
      persistValue(valueInputRef.current.value);
    }
  }, [persistValue]);

  const persistDataNotAvailable = (checked: boolean) => {
    if (isSaving || checked === isDataNotAvailable) return;

    const previousValue = isDataNotAvailable;
    setIsDataNotAvailable(checked);
    setIsSaving(true);
    setSaveError(null);

    const loadingToastId = toast.loading("Updating availability status...");

    updateDataEntryAvailabilityAction({
      inputDefId: row.inputDefId,
      energyResourceId: row.energyResourceId ?? null,
      customerTypeId: row.customerTypeId ?? null,
      paymentModeId: row.paymentModeId ?? null,
      isDataNotAvailable: checked,
    })
      .then(() => {
        removeDraft(draftKey);
        router.refresh();
        toast.success("Availability status updated.", {
          id: loadingToastId,
        });
      })
      .catch((error) => {
        setIsDataNotAvailable(previousValue);
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update availability status.";
        setSaveError(message);
        toast.error(message, {
          id: loadingToastId,
          duration: 6000,
        });
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const persistComment = useCallback(
    (
      nextComment?: string,
      options?: { showEmptyToast?: boolean },
    ) => {
      const normalized = (nextComment ?? commentDraft).trim();

      if (isCommentSaving) return;

      if (normalized.length === 0) {
        if (options?.showEmptyToast !== false) {
          toast.error("Please enter a comment before saving.");
        }
        return;
      }

      setIsCommentSaving(true);

      const optimisticComment = {
        comment: normalized,
      };
      setLocalComments((prev) => [...(prev ?? existingComments), optimisticComment]);
      setCommentDraft("");

      const loadingToastId = toast.loading("Saving comment...");

      updateDataEntryCommentAction({
        inputDefId: row.inputDefId,
        energyResourceId: row.energyResourceId ?? null,
        customerTypeId: row.customerTypeId ?? null,
        paymentModeId: row.paymentModeId ?? null,
        comment: normalized,
      })
        .then(() => {
          router.refresh();
          toast.success("Comment saved.", {
            id: loadingToastId,
          });
        })
        .catch(() => {
          setLocalComments(existingComments);
          toast.error("Failed to save comment.", {
            id: loadingToastId,
            duration: 6000,
          });
        })
        .finally(() => {
          setIsCommentSaving(false);
        });
    },
    [row, commentDraft, existingComments, isCommentSaving, router],
  );

  const handleCommentOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
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
            ref={valueInputRef}
            className={`${
              row.value || draftValue ? "border-l-lime-300" : "border-l-red-200"
            } border border-l-7 w-full rounded-l-none`}
            type="number"
            inputMode="decimal"
            defaultValue={displayValue}
            disabled={inputDisabled}
            name={row.inputName}
            aria-label={`Enter value for ${row.inputName}`}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "boolean":
        return (
          <DataEntrySelect
            value={displayValue || undefined}
            disabled={inputDisabled}
            size="input"
            placeholder="Select"
            ariaLabel={`Select boolean value for ${row.inputName}`}
            options={[
              { value: "Yes", label: "Yes" },
              { value: "No", label: "No" },
            ]}
            onValueChange={(nextValue) => persistValue(nextValue)}
            triggerClassName={`border-l-7 rounded-l-none rounded-r-lg ${
              row.value || draftValue ? "border-l-lime-200" : "border-l-red-200"
            }`}
          />
        );
      case "date":
        return (
          <Input
            type="date"
            defaultValue={displayValue}
            disabled={inputDisabled}
            aria-label={`Enter date for ${row.inputName}`}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "select":
        return (
          <Input
            defaultValue={displayValue}
            disabled={inputDisabled}
            aria-label={`Enter value for ${row.inputName}`}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "text":
        return (
          <Input
            defaultValue={displayValue}
            disabled={inputDisabled}
            aria-label={`Enter value for ${row.inputName}`}
            onKeyDown={handleCommitOnEnter}
            onBlur={(event) => persistValue(event.target.value)}
          />
        );
      case "managedLists":
        return (
          <DataEntryManagedListInput
            managedListName={row.inputName}
            inputName={`input_${row.inputDefId}`}
            valueName={displayValue}
            hasValue={Boolean(row.value || draftValue)}
            disabled={inputDisabled}
            onValueNameChange={(selectedName) => persistValue(selectedName)}
          />
        );
      case "gender":
        return (
          <DataEntrySelect
            value={displayValue || undefined}
            disabled={inputDisabled}
            size="input"
            placeholder="Select"
            ariaLabel={`Select gender for ${row.inputName}`}
            options={[
              { value: "Male", label: "Male" },
              { value: "Female", label: "Female" },
            ]}
            onValueChange={(nextValue) => persistValue(nextValue)}
            triggerClassName={`border-l-7 rounded-l-none rounded-r-lg ${
              row.value || draftValue ? "border-l-lime-200" : "border-l-red-200"
            }`}
          />
        );
      case "fallback":
      default:
        return (
          <span className="text-amber-700" aria-label={`${row.inputName}: ${displayValue || "unsupported"}`}>
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
    if (!row.updatedAt) return null;
    const date = new Date(row.updatedAt);
    if (Number.isNaN(date.getTime())) return null;
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

  const hasUnsavedDraft = Boolean(draftValue && draftValue !== (row.value ?? ""));

  return (
    <div
      className="space-y-2 border p-4 rounded-lg bg-white shadow-md"
      role="group"
      aria-label={`Input cell for ${row.inputName}`}
    >
      {inputControl}

      {hasUnsavedDraft ? (
        <p className="text-[11px] text-amber-600">
          Unsaved draft
        </p>
      ) : null}

      {saveError ? (
        <div className="flex items-center gap-1">
          <p className="text-[11px] text-red-600 flex-1">{saveError}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            onClick={retrySave}
            disabled={isSaving}
            aria-label="Retry save"
          >
            <RotateCcw className="size-3 mr-0.5" />
            Retry
          </Button>
        </div>
      ) : null}

      {isSaving ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Saving...
        </div>
      ) : null}

      {latestComment ? (
        <p className="text-[11px] text-muted-foreground line-clamp-2">
          Latest comment: {latestComment}
        </p>
      ) : null}

      <Textarea
        value={commentDraft}
        onChange={(event) => setCommentDraft(event.target.value)}
        onKeyDown={handleCommentOnEnter}
        placeholder="Add comment (Enter to save)"
        disabled={isSaving || isDataNotAvailable || isCommentSaving}
        className="min-h-16 text-xs"
        aria-label={`Add comment for ${row.inputName}`}
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
            aria-label={`Data not available for ${row.inputName}`}
          />
          <span>Data Not Available</span>
        </label>
        {updatedMetaLabel ? (
          <p className="text-[11px] text-muted-foreground px-1">
            <b>Updated by:</b> <br /> {updatedMetaLabel}
          </p>
        ) : null}
      </div>
      {lastSavedValue && !saveError && !isSaving ? (
        <p className="text-[10px] text-lime-600">
          Saved: {lastSavedValue}
          <button
            type="button"
            className="ml-2 underline text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (valueInputRef.current) {
                const prev = row.value ?? "";
                valueInputRef.current.value = prev;
                persistValue(prev);
              }
            }}
            aria-label={`Undo last change for ${row.inputName}`}
          >
            Undo
          </button>
        </p>
      ) : null}
    </div>
  );
}
