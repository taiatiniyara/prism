"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { DataEntrySelect } from "@/components/data-entry/dataEntrySelect";
import {
  DimensionFilterOptions,
  MeasureEntryFilterContext,
} from "./types";
import { updateFilterContextAction } from "./service";

interface DimensionPanelProps {
  context: MeasureEntryFilterContext;
  dimensions: DimensionFilterOptions;
  applicableDimensions: string[];
}

const DIMENSION_CONFIG: {
  key: keyof DimensionFilterOptions;
  cookieKey: string;
  label: string;
}[] = [
  { key: "energyProviders", cookieKey: "energyProviderId", label: "Provider" },
  { key: "energyTypes", cookieKey: "energyTypeId", label: "Type" },
  { key: "energySources", cookieKey: "energySourceId", label: "Source" },
  {
    key: "customerTypes",
    cookieKey: "customerTypeId",
    label: "Customer Type",
  },
  {
    key: "paymentModes",
    cookieKey: "paymentModeId",
    label: "Payment Mode",
  },
  {
    key: "consumptionBands",
    cookieKey: "consumptionBandId",
    label: "Band",
  },
  { key: "divisions", cookieKey: "divisionId", label: "Division" },
  { key: "genders", cookieKey: "genderId", label: "Gender" },
];

export default function DimensionPanel({
  context,
  dimensions,
  applicableDimensions,
}: DimensionPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const handleDimensionChange = (
    cookieKey: string,
    value: number | null,
  ) => {
    void (async () => {
      await updateFilterContextAction(cookieKey, value);
      const nextParams = new URLSearchParams(searchParams.toString());
      if (value == null) {
        nextParams.delete(cookieKey);
      } else {
        nextParams.set(cookieKey, String(value));
      }
      router.replace(
        `/data-entry/enter-data?${nextParams.toString()}`,
        { scroll: false },
      );
      router.refresh();
    })();
  };

  const getContextValue = (cookieKey: string): number | null => {
    const paramVal = searchParams.get(cookieKey);
    if (paramVal != null) {
      const n = Number(paramVal);
      return Number.isFinite(n) ? n : null;
    }
    const ctxMap: Record<string, number | null> = {
      energyProviderId: context.energyProviderId,
      energyTypeId: context.energyTypeId,
      energySourceId: context.energySourceId,
      customerTypeId: context.customerTypeId,
      paymentModeId: context.paymentModeId,
      consumptionBandId: context.consumptionBandId,
      divisionId: context.divisionId,
      genderId: context.genderId,
    };
    return ctxMap[cookieKey] ?? null;
  };

  return (
    <div className="border rounded-lg bg-muted/30">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Filter className="size-3.5" />
        Dimensions
        {expanded ? (
          <ChevronUp className="size-3.5 ml-auto" />
        ) : (
          <ChevronDown className="size-3.5 ml-auto" />
        )}
      </button>
      {expanded ? (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          {DIMENSION_CONFIG.map((dim) => {
            const options = dimensions[dim.key];
            if (options.length === 0) return null;
            return (
              <DataEntrySelect
                key={dim.cookieKey}
                value={
                  getContextValue(dim.cookieKey) != null
                    ? String(getContextValue(dim.cookieKey))
                    : undefined
                }
                size="compact"
                placeholder={`All ${dim.label}s`}
                ariaLabel={`Filter by ${dim.label}`}
                searchable={options.length > 10}
                options={options.map((o) => ({
                  value: String(o.id),
                  label: o.name,
                }))}
                onValueChange={(value) =>
                  handleDimensionChange(
                    dim.cookieKey,
                    value != null ? Number(value) : null,
                  )
                }
                triggerClassName="min-w-[130px]"
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
