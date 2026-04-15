"use client";

import { toast } from "sonner";
import { Switch } from "../ui/switch";
import { DataTableFormResponse } from "./data-table-create-form";

type BooleanToggleRecord = { id: string | number } & Record<string, unknown>;

export default function BooleanToggle<T extends BooleanToggleRecord>(props: {
  data: T;
  column: keyof T;
  onCheckChange: (data: Partial<T>) => Promise<DataTableFormResponse<T>>;
}) {
  return (
    <Switch
      className="cursor-pointer"
      size="sm"
      defaultChecked={props.data[props.column] as boolean}
      onCheckedChange={async (checked) => {
        const data: Partial<T> = {
          id: props.data.id,
          [props.column]: checked,
        } as Partial<T>;
        const res = await props.onCheckChange(data);
        if (res.success) {
          toast.success(res.message);
        } else {
          toast.error(res.message);
        }
      }}
    />
  );
}
