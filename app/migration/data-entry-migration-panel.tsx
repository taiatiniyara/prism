"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { retrieveDataEntries } from "./service";

export default function DataEntryMigrationPanel() {
  const [reportPeriodInput, setReportPeriodInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

  const parsedOptions = useMemo(() => {
    const reportPeriodRaw = reportPeriodInput.trim();

    const reportPeriodId =
      reportPeriodRaw.length > 0 ? Number(reportPeriodRaw) : undefined;

    return {
      reportPeriodId:
        reportPeriodId != null && Number.isFinite(reportPeriodId)
          ? Math.trunc(reportPeriodId)
          : undefined,
    };
  }, [reportPeriodInput]);

  const runMigration = () => {
    if (
      parsedOptions.reportPeriodId != null &&
      parsedOptions.reportPeriodId <= 0
    ) {
      toast.error("Report Period ID must be a positive number.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const ok = await retrieveDataEntries({
          reportPeriodId: parsedOptions.reportPeriodId,
        });

        if (ok) {
          const scopeText =
            parsedOptions.reportPeriodId != null
              ? `report period ${parsedOptions.reportPeriodId}`
              : "all report periods";

          const message = `Data entries migrated for ${scopeText}.`;
          setLastRunMessage(message);
          toast.success(message);
        } else {
          const message =
            "Data entry migration failed. Check prism server logs for details.";
          setLastRunMessage(message);
          toast.error(message);
        }
      })();
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Data Entry Migration</CardTitle>
        <CardDescription>
          Run targeted migrations for data entries. Leave Report Period ID empty
          to migrate all report periods.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="migration-report-period-id">Report Period ID</Label>
          <Input
            id="migration-report-period-id"
            name="report period id"
            type="number"
            min={1}
            value={reportPeriodInput}
            onChange={(event) => setReportPeriodInput(event.target.value)}
            placeholder="Leave blank to migrate all"
            disabled={isPending}
          />
        </div>

        <Button
          onClick={runMigration}
          disabled={isPending}
        >
          {isPending ? "Migrating..." : "Run Data Entry Migration"}
        </Button>

        {lastRunMessage ? (
          <p className="text-muted-foreground md:col-span-3 text-sm">
            {lastRunMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
