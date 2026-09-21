"use client";

import { FaCircle } from "react-icons/fa";
import { TriangleAlert } from "lucide-react";

import {
  InputComment,
  ReviewKpiInputValue,
  ReviewKpiPermissions,
} from "@/app/data-entry/review-kpi/types";
import { getAvailableStatusActions } from "@/app/data-entry/review-kpi/status-transitions";
import { InputCommentThread } from "@/components/data-entry/input-comment-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReviewKpiInputValueProps {
  input: ReviewKpiInputValue;
  value: string;
  disabled: boolean;
  saving: boolean;
  requiresConfirmation: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancelConfirm: () => void;
  onCommentsUpdated: (comments: InputComment[]) => void;
  permissions: ReviewKpiPermissions;
  statusActionPending: number | null;
  onStatusChange: (toStatusId: number) => void;
}

export function ReviewKpiInputValueCard({
  input,
  value,
  disabled,
  saving,
  requiresConfirmation,
  onValueChange,
  onSave,
  onCancelConfirm,
  onCommentsUpdated,
  permissions,
  statusActionPending,
  onStatusChange,
}: ReviewKpiInputValueProps) {
  const statusActions = getAvailableStatusActions(input.status.id, permissions);

  return (
    <li className="space-y-2 rounded-md border border-border/80 bg-card px-2 py-1.5 text-xs shadow-sm sm:text-sm">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="rounded-sm px-1.5 py-1 font-semibold leading-tight text-foreground/90">
          {input.inputName}
          {input.unitName ? (
            <span className="ml-1 font-normal text-muted-foreground">
              ({input.unitName})
            </span>
          ) : null}
        </div>
        <span className="flex items-center gap-1 px-1.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
          <FaCircle
            color={input.status.color}
            size={8}
          />
          {input.status.label}
        </span>
      </div>

      {input.flag ? (
        <div
          className="flex items-start gap-1.5 rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-1 text-[11px] text-warning-foreground sm:text-xs"
          role="alert"
        >
          <TriangleAlert
            className="mt-0.5 h-3 w-3 shrink-0"
            aria-hidden="true"
          />
          <span>{input.flag.message}</span>
        </div>
      ) : null}

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

      {requiresConfirmation ? (
        <div
          className="space-y-1.5 rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-1.5 text-[11px] sm:text-xs"
          role="alertdialog"
        >
          <p>
            This value is <strong>{input.status.label}</strong> and already
            published. Editing it won&apos;t automatically un-publish
            downstream data. Continue?
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Edit anyway"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={onCancelConfirm}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {statusActions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-border/60 pt-1.5">
          {statusActions.map((action) => (
            <Button
              key={action.toStatusId}
              type="button"
              size="sm"
              variant={action.tone === "advance" ? "secondary" : "outline"}
              className="h-6 px-2 text-[11px]"
              disabled={statusActionPending != null}
              onClick={() => {
                if (window.confirm(action.confirmLabel)) {
                  onStatusChange(action.toStatusId);
                }
              }}
            >
              {statusActionPending === action.toStatusId
                ? "Saving..."
                : action.label}
            </Button>
          ))}
        </div>
      ) : null}

      <InputCommentThread
        dataEntryId={input.dataEntryId}
        comments={input.comments}
        onCommentsUpdated={onCommentsUpdated}
      />
    </li>
  );
}
