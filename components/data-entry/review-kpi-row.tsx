"use client";

import { useMemo, useState, useTransition } from "react";

import {
  ReviewKpiFilterContext,
  ReviewKpiInputValue,
  ReviewKpiRow,
  SyncEventEnvelope,
} from "@/app/data-entry/review-kpi/types";
import { useReviewKpiSync } from "@/app/data-entry/review-kpi/use-review-kpi-sync";
import { ReviewKpiInputValueCard } from "@/components/data-entry/review-kpi-input-value";
import { ReviewKpiSection } from "@/components/data-entry/review-kpi-section";
import { Badge } from "@/components/ui/badge";

interface ReviewKpiRowProps {
  row: ReviewKpiRow;
  context: ReviewKpiFilterContext;
}

const getResultBadgeVariant = (status: ReviewKpiRow["result"]["status"]) => {
  if (status === "calculated") {
    return "secondary" as const;
  }

  if (status === "error") {
    return "destructive" as const;
  }

  return "outline" as const;
};

const toDraftMap = (inputs: ReviewKpiInputValue[]) =>
  Object.fromEntries(
    inputs.map((input) => [input.dataEntryId, input.value ?? ""]),
  );

const formatResultValue = (
  value: string | null,
  unitName: string | null,
): string => {
  if (value == null) {
    return "-";
  }

  if (unitName?.trim() !== "%") {
    return value;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  if (unitName?.trim() === "%") {
    return (parsed * 100).toFixed(1);
  }

  return parsed.toFixed(1);
};

export function ReviewKpiRowCard({ row, context }: ReviewKpiRowProps) {
  const [localRow, setLocalRow] = useState(row);
  const [prevRow, setPrevRow] = useState(row);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(
    toDraftMap(row.inputs),
  );
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  if (prevRow !== row) {
    setPrevRow(row);
    setLocalRow(row);
    setDraftValues(toDraftMap(row.inputs));
  }

  const { isConnected, error: syncError } = useReviewKpiSync({
    context,
    onEvent: (event: SyncEventEnvelope) => {
      if (event.kpiDefId !== localRow.kpiDefId) {
        return;
      }

      if (event.eventType === "input-updated") {
        const input = event.payload.input as ReviewKpiInputValue | undefined;
        const result = event.payload.result as
          | ReviewKpiRow["result"]
          | undefined;

        if (input) {
          setLocalRow((prev) => ({
            ...prev,
            inputs: prev.inputs.map((candidate) =>
              candidate.dataEntryId === input.dataEntryId ? input : candidate,
            ),
            result: result ?? prev.result,
          }));
          setDraftValues((prev) => ({
            ...prev,
            [input.dataEntryId]: input.value ?? "",
          }));
        }
      }

      if (event.eventType === "comment-added") {
        const comments = event.payload.comments as
          | ReviewKpiInputValue["comments"]
          | undefined;
        const dataEntryId = event.dataEntryId;

        if (comments && dataEntryId) {
          setLocalRow((prev) => ({
            ...prev,
            inputs: prev.inputs.map((candidate) =>
              candidate.dataEntryId === dataEntryId
                ? { ...candidate, comments }
                : candidate,
            ),
          }));
        }
      }
    },
  });

  const recalculationPending =
    isSaving &&
    (localRow.result.status === "stale" ||
      localRow.result.status === "missing-input");

  const formattedResultValue = formatResultValue(
    localRow.result.value,
    localRow.unitName,
  );

  const sortedInputs = useMemo(
    () =>
      [...localRow.inputs].sort((a, b) =>
        a.inputName.localeCompare(b.inputName),
      ),
    [localRow.inputs],
  );

  const saveInput = (input: ReviewKpiInputValue) => {
    if (input.dataEntryId.startsWith("missing-")) {
      return;
    }

    setSaveError(null);
    setActiveSaveId(input.dataEntryId);

    startSaveTransition(async () => {
      try {
        const response = await fetch(
          `/api/data-entry/review-kpi/inputs/${input.dataEntryId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              value: draftValues[input.dataEntryId] ?? null,
              updatedAt: input.updatedAt,
            }),
          },
        );

        const body = (await response.json().catch(() => null)) as {
          input?: ReviewKpiInputValue;
          result?: ReviewKpiRow["result"];
          message?: string;
          latest?: ReviewKpiInputValue;
        } | null;

        if (response.status === 409 && body?.latest) {
          const latest = body.latest;

          setLocalRow((prev) => ({
            ...prev,
            inputs: prev.inputs.map((candidate) =>
              candidate.dataEntryId === latest.dataEntryId ? latest : candidate,
            ),
          }));
          setDraftValues((prev) => ({
            ...prev,
            [latest.dataEntryId]: latest.value ?? "",
          }));
          setSaveError(
            body.message ?? "Your value was stale and has been refreshed.",
          );
          return;
        }

        if (!response.ok || !body?.input) {
          throw new Error(body?.message ?? "Failed to save input value.");
        }

        setLocalRow((prev) => ({
          ...prev,
          inputs: prev.inputs.map((candidate) =>
            candidate.dataEntryId === body.input!.dataEntryId
              ? body.input!
              : candidate,
          ),
          result: body.result ?? prev.result,
        }));
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to save input value.",
        );
      } finally {
        setActiveSaveId(null);
      }
    });
  };

  return (
    <div className="gap-2 bg-card shadow border">
      <div className="border-b bg-muted/30 p-3">
        <h2 className="text-sm sm:text-base font-bold">{row.kpiName}</h2>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReviewKpiSection
          tone="sky"
          title="Inputs"
        >
          <ul className="space-y-3">
            {sortedInputs.map((input) => (
              <ReviewKpiInputValueCard
                key={`${localRow.kpiDefId}-${input.dataEntryId}`}
                input={input}
                value={draftValues[input.dataEntryId] ?? ""}
                disabled={isSaving || input.dataEntryId.startsWith("missing-")}
                saving={activeSaveId === input.dataEntryId}
                onValueChange={(value) =>
                  setDraftValues((prev) => ({
                    ...prev,
                    [input.dataEntryId]: value,
                  }))
                }
                onSave={() => saveInput(input)}
                onCommentsUpdated={(comments) => {
                  setLocalRow((prev) => ({
                    ...prev,
                    inputs: prev.inputs.map((candidate) =>
                      candidate.dataEntryId === input.dataEntryId
                        ? { ...candidate, comments }
                        : candidate,
                    ),
                  }));
                }}
              />
            ))}
          </ul>
        </ReviewKpiSection>

        <ReviewKpiSection
          tone="amber"
          title="Formula"
        >
          <div className="rounded-md border border-amber-200/60 bg-background p-2 text-xs sm:text-sm wrap-break-word dark:border-amber-900/50">
            {row.formulaText ?? "No formula configured"}
          </div>
        </ReviewKpiSection>

        <ReviewKpiSection
          tone="lime"
          title="KPI Result"
        >
          <div className="rounded-md border border-success/40/60 bg-background p-2 text-xs sm:text-sm dark:border-lime-900/50">
            <div className="mb-1 text-sm font-semibold sm:text-base">
              {formattedResultValue}
              {localRow.unitName && localRow.result.value != null ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground sm:text-sm">
                  {localRow.unitName}
                </span>
              ) : null}
            </div>
            <Badge variant={getResultBadgeVariant(localRow.result.status)}>
              {localRow.result.status}
            </Badge>
            <p
              className="mt-2 text-xs text-muted-foreground"
              aria-live="polite"
            >
              Connection:{" "}
              <span
                className={`${isConnected ? "text-success" : "text-yellow-500"} font-bold`}
              >
                {isConnected ? "Live" : "Reconnecting"}
              </span>
            </p>
            {recalculationPending ? (
              <p
                className="mt-1 text-xs text-muted-foreground"
                aria-live="polite"
              >
                Recalculation queued...
              </p>
            ) : null}
            {saveError ? (
              <p
                className="mt-1 text-xs text-destructive"
                role="alert"
              >
                {saveError}
              </p>
            ) : null}
            {syncError ? (
              <p
                className="mt-1 text-xs text-destructive"
                role="alert"
              >
                {syncError}
              </p>
            ) : null}
          </div>
        </ReviewKpiSection>
      </div>
    </div>
  );
}
