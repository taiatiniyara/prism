"use client";

import { DataEntryStatus, DataEntryStatusList } from "@/db/schema/dataEntry";
import { ReportPeriodDTO } from "./service";
import { FaCircle } from "react-icons/fa";

export default function ReportPeriodTable(props: {
  list: ReportPeriodDTO[];
  role: string;
}) {
  if (props.list.length === 0) {
    return <div className="p-12 text-slate-500">No report periods found</div>;
  }

  const statusCols = Object.keys(DataEntryStatus);
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
                    {item[sc as keyof ReportPeriodDTO]}
                  </span>
                </td>
              ))}
              <td className="text-left py-2 px-3">{item.Pending_With}</td>
              <td className="text-left py-2 px-3">{item.Updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
