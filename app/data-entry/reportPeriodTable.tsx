"use client";

import { formatLabel } from "@/lib/formatters";
import { ReportPeriodDTO } from "./service";

export default function ReportPeriodTable(props: {
  list: ReportPeriodDTO[];
  role: string;
}) {
  if (props.list.length === 0) {
    return <div className="p-12 text-slate-500">No report periods found</div>;
  }

  const columns = Object.keys(props.list[0]);
  if (props.role !== "DEV" && props.role !== "BMO") {
    columns.splice(columns.indexOf("Utility"), 1);
  }
  return (
    <div className="max-h-[calc(100vh-100px)] border rounded-tl-xl overflow-scroll">
      <table className="text-xs w-full">
        <thead className="sticky top-0 bg-slate-200">
          <tr>
            {columns.map((column) => (
              <th
                className="text-left py-2 px-3"
                key={column}
              >
                {formatLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.list.map((item, index) => (
            <tr
              className="border-b"
              key={index}
            >
              {columns.map((column) => (
                <td
                  className="py-2 px-3"
                  key={column}
                >
                  {item[column as keyof ReportPeriodDTO]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
