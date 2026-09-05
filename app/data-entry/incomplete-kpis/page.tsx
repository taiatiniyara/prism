import { GetIncompleteKpis, IncompleteKpiRow } from "./service";
import { Heading } from "@/components/heading";
import StateMessage from "@/components/ui/state-message";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle } from "lucide-react";

function IncompleteKpiCard({ kpi }: { kpi: IncompleteKpiRow }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">
              {kpi.categoryName} &raquo; {kpi.subcategoryName}
            </span>
          </div>
          <h4 className="font-semibold text-sm mt-1">{kpi.kpiName}</h4>
          <div className="text-xs text-muted-foreground mt-0.5">
            {kpi.utilityName} &middot; {kpi.reportPeriodLabel}
          </div>
        </div>
        {kpi.unitName && (
          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
            {kpi.unitName}
          </span>
        )}
      </div>

      {kpi.formulaText && (
        <div className="text-xs font-mono bg-white border rounded p-2 text-slate-600">
          Formula: {kpi.formulaText}
        </div>
      )}

      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Missing Inputs:
        </span>
        {kpi.inputs
          .filter((i) => i.value == null || i.value.trim() === "")
          .map((input) => (
            <div
              key={input.dataEntryId}
              className="flex items-center justify-between text-xs bg-danger/10 border border-danger/40 rounded px-2 py-1"
            >
              <span>{input.inputName}</span>
              <span className="text-danger font-medium">Missing</span>
            </div>
          ))}
      </div>

      <div className="flex justify-end">
        <Link
          href={`/data-entry/review-kpi?reportTypeId=${kpi.reportTypeId ?? ""}&reportPeriodId=${kpi.reportPeriodId ?? ""}&kpiCategoryId=${kpi.kpiCategoryId ?? ""}`}
        >
          <Button size="sm" variant="outline" className="text-xs">
            Review KPI <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default async function IncompleteKpisPage() {
  const list = await GetIncompleteKpis();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Heading level={5} className="font-bold">
          Incomplete KPIs
        </Heading>
        <span className="text-sm text-muted-foreground">
          {list.length} KPI{list.length !== 1 ? "s" : ""} with missing data
        </span>
      </div>

      {list.length === 0 ? (
        <StateMessage>All KPIs have complete data.</StateMessage>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((kpi) => (
            <IncompleteKpiCard key={`${kpi.kpiDefId}-${kpi.reportPeriodId}`} kpi={kpi} />
          ))}
        </div>
      )}
    </div>
  );
}
