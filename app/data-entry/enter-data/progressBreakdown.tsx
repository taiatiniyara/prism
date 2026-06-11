"use client";

import { useRouter } from "next/navigation";
import { DataEntryProgressSummary } from "@/app/data-entry/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ProgressBreakdownProps {
  progress: DataEntryProgressSummary;
}

export default function ProgressBreakdown({
  progress,
}: ProgressBreakdownProps) {
  const router = useRouter();
  const progressPercentage =
    progress.totalInputs > 0
      ? Math.round((progress.completedInputs / progress.totalInputs) * 100)
      : 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border py-2 w-65 text-left rounded-md px-4 shadow hover:shadow-lg cursor-pointer hover:bg-muted/50 transition-colors"
          aria-label="Open progress breakdown"
        >
          <div className="mb-0.5 flex items-center justify-between text-[11px]">
            <span className="font-medium">Progress</span>
            <span className="text-muted-foreground">{progressPercentage}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-lime-400 transition-all"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {progress.completedInputs}/{progress.totalInputs} completed
            </span>
            <span>{"View breakdown ->"}</span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Progress Breakdown</DialogTitle>
          <DialogDescription>
            Completion by category and subcategory for the selected report
            period. Click a row to navigate to that subcategory.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Subcategory</th>
                <th className="px-3 py-2 text-right font-medium">Completed</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {progress.breakdown.map((item) => (
                <tr
                  key={`${item.categoryName}-${item.subcategoryName}`}
                  className="border-t cursor-pointer hover:bg-muted/50 transition-colors"
                  role="button"
                  tabIndex={0}
                  aria-label={`Navigate to ${item.subcategoryName}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      router.push("/data-entry/enter-data");
                    }
                  }}
                  onClick={() => {
                    router.push("/data-entry/enter-data");
                  }}
                >
                  <td className="px-3 py-2">{item.categoryName}</td>
                  <td className="px-3 py-2">{item.subcategoryName}</td>
                  <td className="px-3 py-2 text-right">
                    {item.completedInputs}
                  </td>
                  <td className="px-3 py-2 text-right">{item.totalInputs}</td>
                </tr>
              ))}
              {progress.breakdown.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    No progress data available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
