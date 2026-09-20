"use client";

import { toast } from "sonner";
import { Checkbox } from "../ui/checkbox";
import { DataTableFormResponse } from "./data-table-create-form";

type BooleanToggleRecord = { id: string | number } & Record<string, unknown>;

export default function BooleanToggle<T extends BooleanToggleRecord>(props: {
  data: T;
  column: keyof T;
  onCheckChange: (data: Partial<T>) => Promise<DataTableFormResponse<T>>;
}) {
  return (
    <Checkbox
      // 75% = 25% smaller than the default size-4; scales box + check together.
      className="cursor-pointer scale-75"
      defaultChecked={props.data[props.column] as boolean}
      onCheckedChange={async (checked) => {
        const data: Partial<T> = {
          id: props.data.id,
          [props.column]: checked === true,
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
