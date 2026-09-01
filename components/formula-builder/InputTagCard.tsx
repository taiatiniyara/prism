"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DimensionBindingCell } from "./DimensionBindingCell";
import {
  DIMENSIONS,
  type DimBinding,
  type DimensionField,
  type GrainMode,
  type MeasureCatalogueItem,
  type MemberOption,
  type TagCardState,
} from "./types";

const DIM_LABEL: Record<DimensionField, string> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.field, d.label]),
) as Record<DimensionField, string>;

const GRAIN_OPTIONS: { value: GrainMode; label: string }[] = [
  { value: "inherit", label: "Inherit" },
  { value: "rollup", label: "Roll up from finer" },
  { value: "pin", label: "Pin a level" },
];

const DEFAULT_BINDING: DimBinding = { mode: "inherit", memberId: null };

export interface InputTagCardProps {
  card: TagCardState;
  measure?: MeasureCatalogueItem;
  dimMembers: Record<DimensionField, MemberOption[]>;
  onChange: (card: TagCardState) => void;
  onRename: (newName: string) => void;
  onRemove: () => void;
  onPickMeasure: () => void;
  /** tailwind bg/text colour classes matching this variable's formula token */
  nameColor?: string;
}

export function InputTagCard({
  card,
  measure,
  dimMembers,
  onChange,
  onRename,
  onRemove,
  onPickMeasure,
  nameColor,
}: InputTagCardProps) {
  const hasMeasureRef = card.measureDefId != null;
  const measureMissing = hasMeasureRef && !measure;

  // Local draft so renaming commits on blur/Enter (keeps the formula token +
  // this card's binding in sync) rather than on every keystroke.
  const [nameDraft, setNameDraft] = useState(card.variableName);
  const [prevVariableName, setPrevVariableName] = useState(card.variableName);

  if (prevVariableName !== card.variableName) {
    setPrevVariableName(card.variableName);
    setNameDraft(card.variableName);
  }

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== card.variableName) onRename(next);
    else setNameDraft(card.variableName);
  };

  const setBinding = (field: DimensionField, binding: DimBinding) => {
    onChange({ ...card, dims: { ...card.dims, [field]: binding } });
  };

  return (
    <div
      className={cn(
        // No overflow-hidden: the dimension-binding popovers (esp. the bottom-
        // row cells like Division/Gender) open downward and must escape the
        // card instead of being clipped.
        "bg-card mt-3 rounded-xl border",
        measureMissing && "border-destructive/60",
      )}
    >
      <div className="flex items-stretch">
        {/* LEFT 30% */}
        <div className="flex w-[30%] shrink-0 flex-col items-start gap-2 p-3.5">
          <Input
            value={nameDraft}
            placeholder="variable_name"
            title="Rename this variable — updates the formula and keeps its binding"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameDraft(card.variableName);
                e.currentTarget.blur();
              }
            }}
            className={cn(
              nameColor ?? "text-accent-foreground bg-transparent",
              "focus-visible:border-ring h-8 rounded-md border-transparent px-1.5 font-mono text-sm font-bold shadow-none",
            )}
          />
          {measure ? (
            <span className="text-muted-foreground text-xs">
              reads{" "}
              <b className="text-foreground font-semibold">{measure.name}</b>
              {measure.unitLabel ? ` (${measure.unitLabel})` : ""}
            </span>
          ) : (
            <>
              <span className="text-muted-foreground text-xs">
                no measure selected yet
              </span>
              <Button
                type="button"
                size="sm"
                className="mt-1 h-8"
                onClick={onPickMeasure}
              >
                &#43; Pick a measure
              </Button>
            </>
          )}
          <div className="mt-auto flex w-full items-center justify-between pt-2">
            {measure && (
              <button
                type="button"
                onClick={onPickMeasure}
                className="text-muted-foreground text-xs underline-offset-2 hover:underline"
              >
                change measure
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive ml-auto text-xs underline-offset-2 hover:underline"
            >
              remove
            </button>
          </div>
        </div>

        {/* RIGHT 70% */}
        <div className="w-[70%] border-l">
          {measureMissing ? (
            <div className="text-destructive bg-destructive/10 m-3.5 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
              <span aria-hidden>&#9888;</span>
              <span>
                <b>
                  {card.measureName
                    ? `“${card.measureName}” is unavailable.`
                    : "The referenced measure is unavailable."}
                </b>{" "}
                This won&rsquo;t compute until it&rsquo;s reactivated or you
                point this input at another measure. The input is never silently
                dropped.
              </span>
            </div>
          ) : !measure ? (
            <div className="text-muted-foreground bg-muted/30 m-3.5 rounded-lg border border-dashed p-3.5 text-xs">
              Dimension tags appear here once a measure is chosen — only the ones
              that measure is scoped on.
            </div>
          ) : (
            <div className="flex items-stretch">
              {/* dimension matrix */}
              <div className="min-w-0 flex-1 p-3.5">
                {measure.applicableDims.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    This measure has no sliceable dimensions — it reports a
                    single value.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {measure.applicableDims.map((dim) => (
                      <DimensionBindingCell
                        key={dim.field}
                        field={dim.field}
                        label={DIM_LABEL[dim.field]}
                        binding={card.dims[dim.field] ?? DEFAULT_BINDING}
                        members={dimMembers[dim.field] ?? []}
                        allowedMemberIds={
                          dim.expansionMode === "by_context"
                            ? dim.allowedMemberIds
                            : undefined
                        }
                        onChange={(b) => setBinding(dim.field, b)}
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* grain column */}
              <div className="w-[150px] shrink-0 border-l p-3.5">
                <label className="text-muted-foreground block text-[10.5px] font-semibold tracking-wide uppercase">
                  Grain / level
                </label>
                <select
                  value={card.grainMode}
                  onChange={(e) =>
                    onChange({
                      ...card,
                      grainMode: e.target.value as GrainMode,
                    })
                  }
                  className="border-border bg-muted/40 text-foreground mt-1 h-8 w-full rounded-md border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {GRAIN_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground mt-1.5 text-[10.5px] leading-tight">
                  Phase 1 · informational
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InputTagCard;
