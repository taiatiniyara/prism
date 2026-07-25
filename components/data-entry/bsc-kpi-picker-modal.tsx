"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  InputOption,
  KpiOption,
} from "@/app/data-entry/balanced-scorecard/new-bsc/types";

export type PickedMetric = {
  source: "kpi" | "input";
  kpiDefinitionId: number | null;
  inputDefinitionId: number | null;
  name: string;
  unit: string | null;
};

type NormItem = {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
  subcategory: string | null;
};

const UNCAT = "Uncategorised";

const distinct = (vals: (string | null)[]): string[] =>
  [...new Set(vals.map((v) => v ?? UNCAT))].sort((a, b) => a.localeCompare(b));

const toOptions = (vals: string[]) => vals.map((v) => ({ value: v, label: v }));

// SearchableSelect with the search/empty labels pre-filled.
function Dropdown(
  props: Omit<
    React.ComponentProps<typeof SearchableSelect>,
    "searchPlaceholder" | "emptyLabel"
  >,
) {
  return (
    <SearchableSelect
      searchPlaceholder="Search…"
      emptyLabel="No matches"
      {...props}
    />
  );
}

function Segmented({
  value,
  onChange,
}: {
  value: "kpi" | "input";
  onChange: (v: "kpi" | "input") => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-xs">
      {(["kpi", "input"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          className={`rounded px-3 py-1 ${
            value === opt
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(opt)}
        >
          {opt === "kpi" ? "KPI" : "Input"}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-medium">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function BscKpiPickerModal({
  open,
  onOpenChange,
  kpiOptions,
  inputOptions,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kpiOptions: KpiOption[];
  inputOptions: InputOption[];
  onSelect: (picked: PickedMetric) => void;
}) {
  const [mode, setMode] = useState<"pick" | "create">("pick");

  // Pick-flow state
  const [source, setSource] = useState<"kpi" | "input">("kpi");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);

  // Create-flow state (classification only — submit wired in a later step)
  const [cSource, setCSource] = useState<"kpi" | "input">("kpi");
  const [cCategory, setCCategory] = useState<string | null>(null);
  const [cSubcategory, setCSubcategory] = useState<string | null>(null);
  const [cDataType, setCDataType] = useState<string | null>(null);

  const itemsFor = (src: "kpi" | "input"): NormItem[] =>
    src === "kpi"
      ? kpiOptions.map((o) => ({
          id: o.kpiDefinitionId,
          name: o.name,
          unit: o.unit,
          category: o.category,
          subcategory: o.subcategory,
        }))
      : inputOptions.map((o) => ({
          id: o.inputDefinitionId,
          name: o.name,
          unit: o.unit,
          category: o.category,
          subcategory: o.subcategory,
        }));

  const items = useMemo(() => itemsFor(source), [source, kpiOptions, inputOptions]);
  const categories = useMemo(() => distinct(items.map((i) => i.category)), [items]);
  const subcategories = useMemo(
    () =>
      category
        ? distinct(
            items
              .filter((i) => (i.category ?? UNCAT) === category)
              .map((i) => i.subcategory),
          )
        : [],
    [items, category],
  );
  const names = useMemo(
    () =>
      category && subcategory
        ? items.filter(
            (i) =>
              (i.category ?? UNCAT) === category &&
              (i.subcategory ?? UNCAT) === subcategory,
          )
        : [],
    [items, category, subcategory],
  );

  const createItems = useMemo(() => itemsFor(cSource), [cSource, kpiOptions, inputOptions]);
  const cCategories = useMemo(
    () => distinct(createItems.map((i) => i.category)),
    [createItems],
  );
  const cSubcategories = useMemo(
    () =>
      cCategory
        ? distinct(
            createItems
              .filter((i) => (i.category ?? UNCAT) === cCategory)
              .map((i) => i.subcategory),
          )
        : [],
    [createItems, cCategory],
  );
  const dataTypes = useMemo(
    () => distinct(inputOptions.map((i) => i.dataType)),
    [inputOptions],
  );

  const reset = () => {
    setMode("pick");
    setSource("kpi");
    setCategory(null);
    setSubcategory(null);
    setItemId(null);
    setCSource("kpi");
    setCCategory(null);
    setCSubcategory(null);
    setCDataType(null);
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleSelect = () => {
    const item = names.find((n) => n.id === itemId);
    if (!item) return;
    onSelect({
      source,
      kpiDefinitionId: source === "kpi" ? item.id : null,
      inputDefinitionId: source === "input" ? item.id : null,
      name: item.name,
      unit: item.unit,
    });
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {mode === "pick" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a metric to track</DialogTitle>
              <DialogDescription>
                Choose Input or KPI, then drill down to the metric. Can&apos;t
                find it? Create a new one.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <Row label="Source">
                <Segmented
                  value={source}
                  onChange={(v) => {
                    setSource(v);
                    setCategory(null);
                    setSubcategory(null);
                    setItemId(null);
                  }}
                />
              </Row>
              <Row label="Category">
                <Dropdown
                  options={toOptions(categories)}
                  value={category ?? undefined}
                  placeholder="Select category"
                  onValueChange={(v) => {
                    setCategory(v);
                    setSubcategory(null);
                    setItemId(null);
                  }}
                  triggerClassName="h-8 w-full text-xs"
                />
              </Row>
              <Row label="Subcategory">
                <Dropdown
                  options={toOptions(subcategories)}
                  value={subcategory ?? undefined}
                  placeholder="Select subcategory"
                  disabled={!category}
                  onValueChange={(v) => {
                    setSubcategory(v);
                    setItemId(null);
                  }}
                  triggerClassName="h-8 w-full text-xs"
                />
              </Row>
              <Row label={source === "kpi" ? "KPI" : "Input"}>
                <div className="flex items-center gap-2">
                  <Dropdown
                    options={names.map((n) => ({
                      value: String(n.id),
                      label: n.unit ? `${n.name} (${n.unit})` : n.name,
                    }))}
                    value={itemId != null ? String(itemId) : undefined}
                    placeholder={`Select ${source === "kpi" ? "KPI" : "input"}`}
                    disabled={!subcategory}
                    onValueChange={(v) => setItemId(Number(v))}
                    triggerClassName="h-8 flex-1 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 whitespace-nowrap text-xs"
                    onClick={() => setMode("create")}
                  >
                    Create New KPI
                  </Button>
                </div>
              </Row>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={itemId == null} onClick={handleSelect}>
                Select
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create a new metric</DialogTitle>
              <DialogDescription>
                Classify the new metric: is it an Input or a KPI, where does it
                belong, and what type of data is it?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <Row label="Type">
                <Segmented
                  value={cSource}
                  onChange={(v) => {
                    setCSource(v);
                    setCCategory(null);
                    setCSubcategory(null);
                  }}
                />
              </Row>
              <Row label="Category">
                <Dropdown
                  options={toOptions(cCategories)}
                  value={cCategory ?? undefined}
                  placeholder="Select category"
                  onValueChange={(v) => {
                    setCCategory(v);
                    setCSubcategory(null);
                  }}
                  triggerClassName="h-8 w-full text-xs"
                />
              </Row>
              <Row label="Subcategory">
                <Dropdown
                  options={toOptions(cSubcategories)}
                  value={cSubcategory ?? undefined}
                  placeholder="Select subcategory"
                  disabled={!cCategory}
                  onValueChange={(v) => setCSubcategory(v)}
                  triggerClassName="h-8 w-full text-xs"
                />
              </Row>
              <Row label="Data type">
                <Dropdown
                  options={toOptions(dataTypes)}
                  value={cDataType ?? undefined}
                  placeholder="Select data type"
                  onValueChange={(v) => setCDataType(v)}
                  triggerClassName="h-8 w-full text-xs"
                />
              </Row>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMode("pick")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={!cCategory || !cSubcategory || !cDataType}
                onClick={() =>
                  toast.info(
                    "Classification captured. Creating new metrics will be wired up next.",
                  )
                }
              >
                Create
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
