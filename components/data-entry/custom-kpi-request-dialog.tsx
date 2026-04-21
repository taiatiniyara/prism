"use client";

import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";

import { CustomKpiRequestForm } from "@/components/data-entry/custom-kpi-request-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus } from "lucide-react";

type InputOption = {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
  category: string | null;
  subcategory: string | null;
};

type UnitOption = {
  id: number;
  name: string;
};

type DataTypeOption = {
  id: number;
  name: string;
};

export function CustomKpiRequestDialog(props: {
  inputOptions: InputOption[];
  unitOptions: UnitOption[];
  dataTypeOptions: DataTypeOption[];
  triggerLabel?: string;
  triggerSize?: ComponentProps<typeof Button>["size"];
  triggerVariant?: ComponentProps<typeof Button>["variant"];
  triggerClassName?: string;
  triggerDisabled?: boolean;
  triggerTooltip?: string;
  onRequestSubmitted?: (request: {
    id: string;
    title: string;
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "REPLACED";
  }) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const collapseExpandedCustomKpiRequests = () => {
    if (typeof document === "undefined") {
      return;
    }

    const expandedRequests = document.querySelectorAll<HTMLDetailsElement>(
      'details[data-custom-kpi-request-details="true"][open]',
    );
    expandedRequests.forEach((panel) => {
      panel.open = false;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                type="button"
                size={props.triggerSize}
                variant={props.triggerVariant}
                className={props.triggerClassName}
                disabled={props.triggerDisabled}
              >
                <Plus /> {props.triggerLabel ?? "New Custom KPI"}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {props.triggerTooltip ?? "Create New KPI"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>New Custom KPI Request</DialogTitle>
          <DialogDescription>
            Submit a custom KPI for Admins to review.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <CustomKpiRequestForm
            inputOptions={props.inputOptions}
            unitOptions={props.unitOptions}
            dataTypeOptions={props.dataTypeOptions}
            onSubmitted={async (request) => {
              collapseExpandedCustomKpiRequests();
              await props.onRequestSubmitted?.(request);
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
