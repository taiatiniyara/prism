"use client";

import {
  InputComment,
  ReviewKpiInputValue,
} from "@/app/data-entry/review-kpi/types";
import { InputCommentThread } from "@/components/data-entry/input-comment-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReviewKpiInputValueProps {
  input: ReviewKpiInputValue;
  value: string;
  disabled: boolean;
  saving: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCommentsUpdated: (comments: InputComment[]) => void;
}

export function ReviewKpiInputValueCard({
  input,
  value,
  disabled,
  saving,
  onValueChange,
  onSave,
  onCommentsUpdated,
}: ReviewKpiInputValueProps) {
  return (
    <li className="space-y-1.5 rounded-md border border-border/80 bg-card px-2 py-1.5 text-xs shadow-sm sm:text-sm">
      <div className="rounded-sm bg-muted/40 px-1.5 py-1 text-sm font-semibold leading-tight text-foreground/90">
        {input.inputName}
        {input.unitName ? (
          <span className="ml-1 font-normal text-muted-foreground">
            ({input.unitName})
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-1.5">
        <Input
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-7 border-border/70 bg-background text-xs sm:h-8 sm:text-sm"
          aria-label={`${input.inputName} value`}
        />
        <Button
          type="button"
          size="sm"
          className="h-7 min-w-14 px-2 text-xs"
          disabled={disabled || value === (input.value ?? "")}
          onClick={onSave}
          aria-label={`Save ${input.inputName}`}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <InputCommentThread
        dataEntryId={input.dataEntryId}
        comments={input.comments}
        onCommentsUpdated={onCommentsUpdated}
      />
    </li>
  );
}
