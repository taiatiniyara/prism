"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DownloadRow } from "./service";

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DownloadButton({ data }: { data: DownloadRow[] }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (format: "csv" | "json") => {
    if (data.length === 0) {
      toast.error("No data available to download");
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString().split("T")[0];

      if (format === "csv") {
        const headers = [
          "Utility",
          "Report Type",
          "Report Period",
          "Category",
          "Subcategory",
          "Input Name",
          "Value",
          "Unit",
          "Status",
        ];
        const csvContent = [
          headers.join(","),
          ...data.map((row) =>
            [
              `"${row.utility}"`,
              `"${row.report_type}"`,
              `"${row.report_period}"`,
              `"${row.category}"`,
              `"${row.subcategory}"`,
              `"${row.input_def_name}"`,
              `"${row.value}"`,
              `"${row.unit}"`,
              `"${row.status}"`,
            ].join(","),
          ),
        ].join("\n");

        downloadBlob(
          csvContent,
          `prism-${format}-${now}.csv`,
          "text/csv",
        );
      } else if (format === "json") {
        const jsonContent = JSON.stringify(data, null, 2);
        downloadBlob(
          jsonContent,
          `prism-${format}-${now}.json`,
          "application/json",
        );
      }

      toast.success(`Downloaded ${data.length} rows as ${format.toUpperCase()}`);
    } catch {
      toast.error(`Failed to download ${format.toUpperCase()}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleDownload("csv")}>
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("json")}>
          Download JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
