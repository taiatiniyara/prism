"use client";

import { formatLabel } from "@/lib/formatters";
import {
  useFormId,
  useFormOverrides,
  useReorderableList,
} from "../dev/form-overrides-provider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import SubmitBtn from "../submitBtn";
import { FaPlus, FaUpload } from "react-icons/fa";
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
import DataTableManagedListInput from "./data-table-managed-list-input";
import { ScrollArea } from "../ui/scroll-area";
import BooleanFormInput from "./boolean-form-input";
import InputAlternativeNamesEditor from "./input-alternative-names-editor";

export type FieldType =
  | "text"
  | "date"
  | "number"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea"
  | "email"
  | "boolean"
  | "managed-list"
  | "alternative-names"
  | "color";

export interface DataTableFormResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

interface DataTableCreateFormField<T> {
  key: keyof T;
  label?: string;
  type: FieldType;
  required?: boolean;
  disabled?: boolean;
  className?: string; // extra classes for the input (e.g. "uppercase")
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
  const mutable = obj as Record<string, unknown>;
  for (const field of fields) {
    const key = String(field.key);

    if (field.type === "boolean") {
      const values = formData.getAll(key);
      if (values.length > 0) {
        mutable[key] = values.some((value) => {
          const normalized = String(value).toLowerCase();
          return (
            normalized === "true" || normalized === "on" || normalized === "1"
          );
        });
      }
      continue;
    }

    const value = formData.get(key);
    if (value !== null) {
      mutable[key] = value;
    }
  }
  return obj;
}

function field<T>(field: DataTableCreateFormField<T>, fieldLabel: string) {
  if (field.type === "select") {
    return (
      <Select
        name={field.key as string}
        disabled={field.disabled}
      >
        <SelectTrigger className="w-full shadow">
          <SelectValue placeholder={`Select ${fieldLabel}`} />
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
          required={field.required ?? true}
          disabled={field.disabled}
          name={field.key as string}
        />
        Yes
      </Label>
    );
  }

  if (field.type === "boolean") {
    return (
      <BooleanFormInput
        name={field.key as string}
        defaultValue={false}
        disabled={field.disabled}
      />
    );
  }

  if (field.type === "color") {
    return (
      <Input
        className="h-10 p-0 border-0 shadow-none w-24"
        required={field.required ?? true}
        disabled={field.disabled}
        type={field.type}
        name={field.key as string}
      />
    );
  }

  if (field.type === "radio") {
    return (
      <Input
        required={field.required ?? true}
        disabled={field.disabled}
        type={field.type}
        name={field.key as string}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        required={field.required ?? true}
        disabled={field.disabled}
        name={field.key as string}
      ></Textarea>
    );
  }

  if (field.type === "managed-list") {
    return (
      <DataTableManagedListInput
        managedListName={field.managedListName!}
        inputName={field.key as string}
      />
    );
  }

  if (field.type === "alternative-names") {
    return (
      <InputAlternativeNamesEditor
        inputName={field.key as string}
        disabled={field.disabled}
      />
    );
  }

  return (
    <Input
      required={field.required ?? true}
      disabled={field.disabled}
      type={field.type}
      name={field.key as string}
      className={field.className}
    />
  );
}

export function DataTableCreateForm<T>(props: DataTableCreateFormProps<T>) {
  const formId = useFormId();
  const { getLabel } = useFormOverrides();
  const { ordered, dragProps } = useReorderableList(
    formId,
    props.fields,
    (f) => String(f.key),
  );
  return (
    <Sheet>
      <SheetTrigger className="flex gap-1 items-center bg-slate-200 text-black px-2 py-1 cursor-pointer hover:bg-slate-300 transition-colors rounded text-xs font-bold">
        <FaPlus size={12} /> Add
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">New Record</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)]">
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
            {ordered.map((f) => (
              <div
                className="space-y-1"
                key={f.key as string}
                {...dragProps(f.key.toString())}
              >
                <Label
                  data-form-id={formId}
                  data-form-field-key={f.key.toString()}
                  data-form-default-label={f.label ?? formatLabel(f.key.toString())}
                >
                  {getLabel(
                    formId,
                    f.key.toString(),
                    f.label ?? formatLabel(f.key.toString()),
                  )}
                </Label>
                {field(f, f.label ?? formatLabel(f.key.toString()))}
              </div>
            ))}
            <SubmitBtn
              text={
                <>
                  <FaUpload /> Submit
                </>
              }
            />
          </form>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
