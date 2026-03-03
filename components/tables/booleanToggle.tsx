"use client";

import { toast } from "sonner";
import { Switch } from "../ui/switch";
import { DataTableFormResponse } from "./data-table-create-form";

export default function BooleanToggle<T>(props: {
  data: T | any;
  column: keyof T;
  onCheckChange: (data: Partial<T | any>) => Promise<DataTableFormResponse<T>>;
}) {
  return (
    <Switch
      className="cursor-pointer"
      size="sm"
      defaultChecked={props.data[props.column] as boolean}
      onCheckedChange={async (checked) => {
        const data: Partial<T | any> = {
          id: props.data.id,
          [props.column]: checked,
        };
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
