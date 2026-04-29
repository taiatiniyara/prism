"use client";

import { Button } from "@/components/ui/button";
import {
  backfillEnergyResourcePeriods,
  retrieveCountries,
  retrieveEnergyResources,
  retrieveInputDefinitions,
  retrieveKpiDefinitions,
  retrieveManagedLists,
  retrieveReportPeriods,
  retrieveRoles,
  retrieveUsers,
  retrieveUtilityData,
} from "./service";
import { toast } from "sonner";

const buttonList: {
  label: string;
  fn: () => Promise<boolean>;
}[] = [
  {
    label: "Migrate Managed Lists",
    fn: retrieveManagedLists,
  },
  {
    label: "Migrate Countries",
    fn: retrieveCountries,
  },
  {
    label: "Migrate Roles",
    fn: retrieveRoles,
  },
  {
    label: "Migrate Users",
    fn: retrieveUsers,
  },
  {
    label: "Migrate Utility Data",
    fn: retrieveUtilityData,
  },
  {
    label: "Migrate Report Periods",
    fn: retrieveReportPeriods,
  },
  {
    label: "Migrate Energy Resources",
    fn: retrieveEnergyResources,
  },
  {
    label: "Backfill Energy Resource Periods",
    fn: backfillEnergyResourcePeriods,
  },
  {
    label: "Migrate KPI Definitions",
    fn: retrieveKpiDefinitions,
  },
  {
    label: "Migrate Input Definitions",
    fn: retrieveInputDefinitions,
  },
];

export default function MigrationButtons() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {buttonList.map((btn) => (
        <Button
          key={btn.label}
          onClick={async () => {
            const r = await btn.fn();
            if (r === true) {
              toast.success(`${btn.label} migrated successfully`);
            } else {
              toast.error(`Failed to migrate ${btn.label}`);
            }
          }}
        >
          {btn.label}
        </Button>
      ))}
    </div>
  );
}
