"use client";

import { formatLabel } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SubmitBtn from "../submitBtn";
import { FaPlus } from "react-icons/fa";

type FieldType =
  | "text"
  | "number"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea";

interface DataTableCreateFormResponse {
  success: boolean;
  message: string;
}

interface DataTableCreateFormField<T> {
  key: keyof T;
  type: FieldType;
  selectList?: {
    label: string;
    value: string;
  }[];
}

export interface DataTableCreateFormProps<T> {
  fields: DataTableCreateFormField<T>[];
  buttonText: string;
  formAction: (
    data: Partial<T>,
    id?: string | number,
  ) => Promise<DataTableCreateFormResponse>;
}

function formDataToObject<T>(
  formData: FormData,
  fields: DataTableCreateFormField<T>[],
): Partial<T> {
  const obj: Partial<T> = {};
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
      <div key={field.key as string}>
        <label htmlFor={field.key as string}>
          {formatLabel(field.key.toString())}
        </label>
        <select name={field.key as string}>
          {field.selectList?.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === "checkbox") {
    return (
      <div key={field.key as string}>
        <label htmlFor={field.key as string}>
          {formatLabel(field.key.toString())}
        </label>
        <input
          type={field.type}
          name={field.key as string}
        />
      </div>
    );
  }
  if (field.type === "radio") {
    return (
      <div key={field.key as string}>
        <label htmlFor={field.key as string}>
          {formatLabel(field.key.toString())}
        </label>
        <input
          type={field.type}
          name={field.key as string}
        />
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div key={field.key as string}>
        <label htmlFor={field.key as string}>
          {formatLabel(field.key.toString())}
        </label>
        <textarea name={field.key as string}></textarea>
      </div>
    );
  }
  return (
    <div key={field.key as string}>
      <label htmlFor={field.key as string}>
        {formatLabel(field.key.toString())}
      </label>
      <input
        type={field.type}
        name={field.key as string}
      />
    </div>
  );
}

export function DataTableCreateForm<T>(props: DataTableCreateFormProps<T>) {
  return (
    <Dialog>
      <DialogTrigger className="flex gap-1 items-center bg-slate-200 text-black px-2 py-1 cursor-pointer hover:bg-slate-400 transition-colors rounded text-xs font-bold">
        <FaPlus className="h-3 w-3" /> Add
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add</DialogTitle>
          <DialogDescription>{props.buttonText}</DialogDescription>
        </DialogHeader>
        <form
          action={async (formData) => {
            const data: Partial<T> = formDataToObject(formData, props.fields);
            const response = await props.formAction(data);
            if (response.success) {
            }
          }}
        >
          {props.fields.map((f) => field(f))}
          <SubmitBtn text={props.buttonText} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
