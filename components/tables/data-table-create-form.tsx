"use client";

import { formatLabel } from "@/lib/formatters";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import SubmitBtn from "../submitBtn";
import { FaPlus } from "react-icons/fa";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";
import ManagedListInput from "./managed-list-input";

export type FieldType =
  | "text"
  | "number"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea"
  | "email"
  | "boolean"
  | "managed-list"
  | "color";

export interface DataTableFormResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

interface DataTableCreateFormField<T> {
  key: keyof T;
  type: FieldType;
  selectList?: {
    label: string;
    value: string | number;
  }[];
  managedListName?: string;
}

export interface DataTableCreateFormProps<T> {
  fields: DataTableCreateFormField<T>[];
  buttonText?: string;
  formAction: (data: T) => Promise<DataTableFormResponse<T>>;
}

export function formDataToObject<T>(
  formData: FormData,
  fields: DataTableCreateFormField<T>[],
): T {
  const obj: T = {} as T;
  for (const field of fields) {
    const value = formData.get(field.key as string);
    if (value !== null) {
      (obj as any)[field.key] = value;
    }
  }
  return obj;
}

function field<T>(field: DataTableCreateFormField<T>) {
  if (field.type === "select") {
    return (
      <Select name={field.key as string}>
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={`Select ${formatLabel(field.key.toString())}`}
          />
        </SelectTrigger>
        <SelectContent>
          {field.selectList?.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value.toString()}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <Label className="flex justify-start border p-3 shadow rounded-lg">
        <Checkbox
          required
          name={field.key as string}
        />
        Yes
      </Label>
    );
  }

  if (field.type === "color") {
    return (
      <Input
        className="h-10 p-0 border-0 shadow-none w-24"
        required
        type={field.type}
        name={field.key as string}
      />
    );
  }

  if (field.type === "radio") {
    return (
      <Input
        required
        type={field.type}
        name={field.key as string}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        required
        name={field.key as string}
      ></Textarea>
    );
  }

  if (field.type === "managed-list") {
    return (
      <ManagedListInput
        managedListName={field.managedListName!}
        inputName={field.key as string}
      />
    );
  }

  return (
    <Input
      required
      type={field.type}
      name={field.key as string}
    />
  );
}

export function DataTableCreateForm<T>(props: DataTableCreateFormProps<T>) {
  return (
    <Sheet>
      <SheetTrigger className="flex gap-1 items-center bg-slate-200 text-black px-2 py-1 cursor-pointer hover:bg-slate-300 transition-colors rounded text-xs font-bold">
        <FaPlus size={12} /> Add
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">New Record</SheetTitle>
        </SheetHeader>
        <form
          className="space-y-4 p-4"
          action={async (formData) => {
            const data: T = formDataToObject(formData, props.fields);
            const response = await props.formAction(data);
            if (response.success) {
              toast.success(response.message);
            } else {
              toast.error(response.message);
            }
          }}
        >
          {props.fields.map((f) => (
            <div
              className="space-y-1"
              key={f.key as string}
            >
              <Label>{formatLabel(f.key.toString())}</Label>
              {field(f)}
            </div>
          ))}
          <SubmitBtn text={props.buttonText} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
