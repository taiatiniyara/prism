"use client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DataTableFormResponse,
  FieldType,
  formDataToObject,
} from "./data-table-create-form";
import SubmitBtn from "../submitBtn";
import { Label } from "../ui/label";
import { formatLabel } from "@/lib/formatters";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import { FaEdit } from "react-icons/fa";

export interface DataTableUpdateFormField<T> {
  key: keyof T;
  type: FieldType;
  selectList?: {
    label: string;
    value: string | number;
  }[];
  managedListName?: string;
  value?: T[keyof T];
}

export interface DataTableUpdateFormProps<T> {
  record: T | any;
  fields: DataTableUpdateFormField<T>[];
  formAction: (body: Partial<T>) => Promise<DataTableFormResponse<T>>;
}

function updateField<T>(field: DataTableUpdateFormField<T>) {
  if (field.type === "boolean") {
    return (
      <Label className="p-3 cursor-pointer shadow border rounded-md">
        <Checkbox
          name={field.key as string}
          defaultChecked={Boolean(field.value)}
        />
        Click to toggle
      </Label>
    );
  }
  if (field.type === "select") {
    return (
      <Select
        name={field.key as string}
        defaultValue={String(field.value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
        <SelectContent>
          {field.selectList?.map((option) => (
            <SelectItem
              key={option.value}
              value={String(option.value)}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "managed-list") {
    return (
      <Select
        name={field.key as string}
        defaultValue={String(field.value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a value" />
        </SelectTrigger>
        <SelectContent>
          {field.selectList?.map((option) => (
            <SelectItem
              key={option.value}
              value={String(option.value)}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      required
      name={field.key as string}
      defaultValue={String(field.value)}
    />
  );
}

export default function DataTableUpdateForm<T>(
  props: DataTableUpdateFormProps<T>,
) {
  return (
    <Sheet>
      <SheetTrigger className="flex gap-1 font-bold text-xs items-center cursor-pointer text-slate-500 hover:text-slate-900 transition-colors py-2">
        <FaEdit size={16} /> Update
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex gap-2 items-center">
            <FaEdit size={24} /> Update Record
          </SheetTitle>
          <SheetDescription>
            Update the record with the following fields
          </SheetDescription>
        </SheetHeader>

        <form
          action={async (formData: FormData) => {
            const data: Partial<T> = formDataToObject(formData, props.fields);
            const res = await props.formAction({
              ...data,
              id: props.record.id,
            });
            if (res.success) {
              toast.success(res.message);
            } else {
              toast.error(res.message);
            }
          }}
          className="px-4 space-y-4"
        >
          {props.fields.map((field, index) => (
            <div
              className="space-y-1"
              key={`${String(field.key)}-${index}`}
            >
              <Label htmlFor={field.key as string}>
                {formatLabel(field.key as string)}
              </Label>
              {updateField({ ...field, value: props.record[field.key] })}
            </div>
          ))}
          <SubmitBtn text="Update" />
        </form>
      </SheetContent>
    </Sheet>
  );
}
