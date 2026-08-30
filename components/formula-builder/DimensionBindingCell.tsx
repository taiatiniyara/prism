"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  DimBinding,
  DimMode,
  DimensionField,
  MemberOption,
} from "./types";

/** Tag-state palette — deliberately distinct from the 5-state pipeline palette.
 *  Pin = teal/green, All = amber, Inherit = slate. Shared with InputTagCard. */
export const TAG_STATE_CLASSES: Record<
  DimMode,
  { chip: string; dot: string; text: string }
> = {
  pin: {
    chip: "border-emerald-300/70 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40",
    dot: "bg-emerald-600 dark:bg-emerald-400",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  all: {
    chip: "border-amber-300/70 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40",
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-800 dark:text-amber-300",
  },
  inherit: {
    chip: "border-border bg-muted/40",
    dot: "bg-slate-400 dark:bg-slate-500",
    text: "text-muted-foreground",
  },
};

const MODE_LABEL: Record<DimMode, string> = {
  pin: "Pin",
  all: "All",
  inherit: "Inherit",
};

export interface DimensionBindingCellProps {
  field: DimensionField;
  label: string;
  binding: DimBinding;
  members: MemberOption[];
  allowedMemberIds?: number[];
  onChange: (binding: DimBinding) => void;
}

export function DimensionBindingCell({
  field,
  label,
  binding,
  members,
  allowedMemberIds,
  onChange,
}: DimensionBindingCellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // close on outside-click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // ignore clicks inside the portaled member <Select> dropdown
      if (target?.closest("[data-radix-popper-content-wrapper]")) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const allowedMembers = useMemo(() => {
    if (!allowedMemberIds || allowedMemberIds.length === 0) return members;
    const allow = new Set(allowedMemberIds);
    return members.filter((m) => allow.has(m.id));
  }, [members, allowedMemberIds]);

  const memberName = useMemo(() => {
    if (binding.mode !== "pin" || binding.memberId == null) return null;
    return members.find((m) => m.id === binding.memberId)?.name ?? null;
  }, [binding, members]);

  const palette = TAG_STATE_CLASSES[binding.mode];
  const valueLabel =
    binding.mode === "pin"
      ? (memberName ?? "Choose member")
      : binding.mode === "all"
        ? "All"
        : "inherit";

  const selectMode = (mode: DimMode) => {
    if (mode === "pin") {
      const first = allowedMembers[0]?.id ?? null;
      onChange({
        mode: "pin",
        memberId: binding.memberId ?? first,
      });
    } else {
      onChange({ mode, memberId: null });
    }
  };

  return (
    <div ref={rootRef} className="relative" data-field={field}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors",
          palette.chip,
        )}
      >
        <span className="text-muted-foreground block text-[10.5px] font-semibold tracking-wide uppercase">
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 flex items-center gap-1.5 text-xs font-semibold",
            palette.text,
          )}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", palette.dot)} />
          <span className="truncate">{valueLabel}</span>
          <span className="ml-auto opacity-60">▾</span>
        </span>
      </button>

      {open && (
        <div className="bg-popover absolute left-0 z-30 mt-1 w-64 rounded-lg border p-1.5 shadow-md">
          {(["pin", "all", "inherit"] as DimMode[]).map((mode) => {
            const active = binding.mode === mode;
            return (
              <div key={mode}>
                <button
                  type="button"
                  onClick={() => selectMode(mode)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                    active ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-3.5 place-content-center rounded-full border-2",
                      active ? "border-primary" : "border-muted-foreground/60",
                    )}
                  >
                    {active && (
                      <span className="bg-primary size-1.5 rounded-full" />
                    )}
                  </span>
                  <span>
                    <b>{MODE_LABEL[mode]}</b>
                    {mode === "pin" && (
                      <span className="text-muted-foreground"> a member</span>
                    )}
                    {mode === "all" && (
                      <span className="text-muted-foreground">
                        {" "}
                        — aggregate across {label.toLowerCase()}
                      </span>
                    )}
                    {mode === "inherit" && (
                      <span className="text-muted-foreground">
                        {" "}
                        — match the level being computed
                      </span>
                    )}
                  </span>
                </button>
                {mode === "pin" && binding.mode === "pin" && (
                  <div className="mt-1 mb-1 pl-6">
                    <SearchableSelect
                      value={
                        binding.memberId != null
                          ? String(binding.memberId)
                          : undefined
                      }
                      onValueChange={(v) =>
                        onChange({ mode: "pin", memberId: Number(v) })
                      }
                      options={allowedMembers.map((m) => ({
                        value: String(m.id),
                        label: m.name,
                      }))}
                      placeholder="Select member"
                      searchPlaceholder={`Search ${label.toLowerCase()}…`}
                      emptyLabel="No members available."
                      triggerClassName="h-8 w-full text-xs"
                      allowEscapeKeyPropagation={false}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DimensionBindingCell;
