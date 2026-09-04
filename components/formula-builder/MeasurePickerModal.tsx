"use client";

import { Fragment, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { MeasureCatalogueItem } from "./types";

const UNGROUPED = "Ungrouped";

export interface MeasurePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measures: MeasureCatalogueItem[];
  onPick: (measure: MeasureCatalogueItem) => void;
  /** the formula variable this measure is being picked for — shown at the top */
  variableName?: string | null;
}

interface GroupNode {
  name: string;
  count: number;
  subgroups: { name: string | null; count: number }[];
}

/** Highlight the matched slice of a label. */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-amber-200 px-0.5 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}

export function MeasurePickerModal({
  open,
  onOpenChange,
  measures,
  onPick,
  variableName,
}: MeasurePickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSubgroup, setActiveSubgroup] = useState<string | null>(null);

  const term = search.trim().toLowerCase();

  const groups = useMemo<GroupNode[]>(() => {
    const map = new Map<string, Map<string | null, number>>();
    for (const m of measures) {
      const g = m.groupName ?? UNGROUPED;
      const sg = m.subgroupName;
      if (!map.has(g)) map.set(g, new Map());
      const sub = map.get(g)!;
      sub.set(sg, (sub.get(sg) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, sub]) => ({
      name,
      count: [...sub.values()].reduce((a, b) => a + b, 0),
      subgroups: [...sub.entries()]
        .map(([sgName, count]) => ({ name: sgName, count }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    }));
  }, [measures]);

  const results = useMemo(() => {
    return measures.filter((m) => {
      const matchesSearch =
        !term ||
        m.name.toLowerCase().includes(term) ||
        (m.variableName ?? "").toLowerCase().includes(term);
      // when searching, ignore the tree filter so nothing is hidden
      if (term) return matchesSearch;
      const g = m.groupName ?? UNGROUPED;
      if (activeGroup && g !== activeGroup) return false;
      if (activeSubgroup != null && m.subgroupName !== activeSubgroup)
        return false;
      return true;
    });
  }, [measures, term, activeGroup, activeSubgroup]);

  const handlePick = (m: MeasureCatalogueItem) => {
    onPick(m);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          {variableName && (
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Variable
              </span>
              <span className="text-foreground font-mono text-lg font-bold break-all">
                {variableName}
              </span>
            </div>
          )}
          <DialogTitle>Pick a measure</DialogTitle>
          <DialogDescription>
            Browse by group / subgroup, or search — the list narrows as you
            type.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border">
          {/* search */}
          <div className="flex items-center gap-2 border-b p-3">
            <span aria-hidden>&#128269;</span>
            <Input
              autoFocus
              value={search}
              placeholder="Search measures by name or variable"
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-primary/60"
            />
            <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
              {term
                ? `${results.length} match${results.length === 1 ? "" : "es"}`
                : `${measures.length} total`}
            </span>
          </div>

          <div className="flex">
            {/* group tree */}
            <div className="h-[360px] w-56 shrink-0 overflow-y-auto border-r">
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveGroup(null);
                    setActiveSubgroup(null);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                    !activeGroup && !activeSubgroup
                      ? "bg-accent font-semibold"
                      : "hover:bg-accent/60",
                  )}
                >
                  All groups
                  <span className="text-muted-foreground text-xs">
                    {measures.length}
                  </span>
                </button>
                {groups.map((g) => {
                  const isOpen = activeGroup === g.name;
                  return (
                    <Fragment key={g.name}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveGroup(g.name);
                          setActiveSubgroup(null);
                        }}
                        className={cn(
                          "mt-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                          isOpen ? "bg-accent font-semibold" : "hover:bg-accent/60",
                        )}
                      >
                        <span className="truncate">{g.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {g.count}
                        </span>
                      </button>
                      {isOpen &&
                        g.subgroups.map((sg) => (
                          <button
                            key={`${g.name}::${sg.name ?? ""}`}
                            type="button"
                            onClick={() => setActiveSubgroup(sg.name)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md py-1 pr-2.5 pl-6 text-left text-xs",
                              activeSubgroup === sg.name
                                ? "bg-accent/70 text-foreground font-semibold"
                                : "text-muted-foreground hover:bg-accent/40",
                            )}
                          >
                            <span className="truncate">
                              {sg.name ?? "(no subgroup)"}
                            </span>
                            <span>{sg.count}</span>
                          </button>
                        ))}
                    </Fragment>
                  );
                })}
              </div>
            </div>

            {/* results */}
            <div className="h-[360px] flex-1 overflow-y-auto">
              <div className="space-y-1 p-2">
                {results.length === 0 && (
                  <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                    No measures match.
                  </p>
                )}
                {results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePick(m)}
                    className="hover:bg-accent flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        <Highlight text={m.name} term={term} />
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {(m.groupName ?? UNGROUPED)}
                        {m.subgroupName ? ` ▸ ${m.subgroupName}` : ""}
                        {m.unitLabel ? ` · ${m.unitLabel}` : ""}
                        {m.variableName ? ` · ${m.variableName}` : ""}
                      </span>
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      select
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MeasurePickerModal;
