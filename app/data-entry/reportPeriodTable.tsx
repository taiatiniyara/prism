"use client";

import { DataEntryStatus, DataEntryStatusList } from "@/db/schema/dataEntry";
import { ReportPeriodDTO } from "./service";
import { FaCircle } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateFilterContextAction } from "@/app/data-entry/enter-data/service";
import { Button } from "@/components/ui/button";

export default function ReportPeriodTable(props: {
  list: ReportPeriodDTO[];
  role: string;
}) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  if (props.list.length === 0) {
    return <div className="p-12 text-slate-500">No report periods found</div>;
  }

  const statusCols = Object.keys(DataEntryStatus) as Array<
    keyof typeof DataEntryStatus
  >;
  const linkableStatuses = new Set<keyof typeof DataEntryStatus>([
    "Pending",
    "Entered",
    "Data_Not_Available",
  ]);

  const handleNavigateWithFilters = (
    reportPeriodId: number,
    status: keyof typeof DataEntryStatus,
  ) => {
    startTransition(() => {
      void (async () => {
        await updateFilterContextAction("reportPeriodId", reportPeriodId);
        await updateFilterContextAction(
          "dataEntryStatusId",
          DataEntryStatus[status],
        );
        router.push("/data-entry/enter-data");
      })();
    });
  };

  return (
    <div className="max-h-[calc(100vh-100px)] border overflow-scroll">
      <table className="text-xs w-full">
        <thead className="sticky top-0 bg-slate-200">
          <tr>
            {props.role === "DEV" ||
              (props.role === "BMO" && (
                <th className="text-left py-2 px-3">Utility</th>
              ))}
            <th className="text-left py-2 px-3">Period</th>
            <th className="text-left py-2 px-3">Report Type</th>
            {statusCols.map((item, i) => (
              <th
                className="text-left py-2 px-3"
                key={i}
              >
                {item}
              </th>
            ))}
            <th className="text-left py-2 px-3">Progress</th>
            <th className="text-left py-2 px-3">Pending With</th>
            <th className="text-left py-2 px-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {props.list.map((item, index) => (
            <tr
              className="border-b"
              key={index}
            >
              {props.role === "DEV" ||
                (props.role === "BMO" && <td>{item.Utility}</td>)}
              <td className="text-left py-2 px-3">{item.Period}</td>
              <td className="text-left py-2 px-3">{item.Report_Type}</td>
              {statusCols.map((sc, i) => (
                <td
                  className="text-left py-2 px-3"
                  key={i}
                >
                  <span className="flex items-center gap-2">
                    <FaCircle
                      color={
                        DataEntryStatusList.find((x) => x.name === sc)?.color
                      }
                    />
                    {linkableStatuses.has(sc) ? (
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto cursor-pointer rounded-sm p-0 text-xs font-semibold text-primary underline decoration-2 underline-offset-2 hover:bg-primary/10 focus-visible:ring-2"
                        disabled={isNavigating}
                        title={`Open Enter Data filtered to ${sc.replaceAll("_", " ")} for ${item.Period}`}
                        aria-label={`Open Enter Data filtered to ${sc.replaceAll("_", " ")} for ${item.Period}`}
                        onClick={() => handleNavigateWithFilters(item.Id, sc)}
                      >
                        {item[sc as keyof ReportPeriodDTO]}
                      </Button>
                    ) : (
                      item[sc as keyof ReportPeriodDTO]
                    )}
                  </span>
                </td>
              ))}
              <td className="text-left py-2 px-3 min-w-40">
                {(() => {
                  const completed = item.Entered + item.Not_Available;
                  const progressPct =
                    item.Requested > 0
                      ? Math.round((completed / item.Requested) * 100)
                      : 0;

                  return (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-lime-500 transition-all"
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {progressPct}% ({completed}/{item.Requested})
                      </div>
                    </div>
                  );
                })()}
              </td>
              <td className="text-left py-2 px-3">{item.Pending_With}</td>
              <td className="text-left py-2 px-3">{item.Updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
