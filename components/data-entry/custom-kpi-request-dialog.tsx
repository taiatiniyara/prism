"use client";

import { useState } from "react";

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
import { FaPlus } from "react-icons/fa";

type InputOption = {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
};

export function CustomKpiRequestDialog(props: { inputOptions: InputOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <FaPlus /> New Custom KPI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>New custom KPI request</DialogTitle>
          <DialogDescription>
            Submit a custom KPI for DEV review.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6">
          <CustomKpiRequestForm
            inputOptions={props.inputOptions}
            onSubmitted={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
