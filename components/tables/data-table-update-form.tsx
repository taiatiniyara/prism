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
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import { FaEdit, FaSave } from "react-icons/fa";
import DataTableManagedListInput from "./data-table-managed-list-input";
import BooleanFormInput from "./boolean-form-input";
import InputAlternativeNamesEditor from "./input-alternative-names-editor";
import { Checkbox } from "../ui/checkbox";
import {
  useFormId,
  useFormOverrides,
} from "../dev/form-overrides-provider";

export interface DataTableUpdateFormField<T> {
  key: keyof T;
  label?: string;
  type: FieldType;
  required?: boolean;
  disabled?: boolean;
  selectList?: {
    label: string;
    value: string | number;
  }[];
  managedListName?: string;
  value?: T[keyof T];
}

export interface DataTableUpdateFormProps<T> {
  record: T & { id: string | number };
  fields: DataTableUpdateFormField<T>[];
  formAction: (body: Partial<T>) => Promise<DataTableFormResponse<T>>;
}

const stringifyFieldValue = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

function updateField<T>(
  field: DataTableUpdateFormField<T>,
  fieldLabel: string,
) {
  if (field.type === "boolean") {
    return (
      <BooleanFormInput
        name={field.key as string}
        defaultValue={Boolean(field.value)}
        disabled={field.disabled}
      />
    );
  }
  if (field.type === "checkbox") {
    // Bind the checked state to the record's current value (was falling through
    // to a plain <Input> whose defaultValue set the value attr, not `checked`).
    return (
      <Label className="flex justify-start border p-3 shadow rounded-lg">
        <Checkbox
          disabled={field.disabled}
          name={field.key as string}
          defaultChecked={Boolean(field.value)}
        />
        Yes
      </Label>
    );
  }
  if (field.type === "select") {
    return (
      <Select
        name={field.key as string}
        disabled={field.disabled}
        defaultValue={field.value ? String(field.value) : undefined}
      >
        <SelectTrigger className="w-full shadow">
          <SelectValue
            placeholder={
              field.value ? String(field.value) : `Select ${fieldLabel}`
            }
          />
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
      <DataTableManagedListInput
        inputName={field.key as string}
        managedListName={field.managedListName || ""}
        value={field.value as number}
      />
    );
  }

  if (field.type === "alternative-names") {
    return (
      <InputAlternativeNamesEditor
        inputName={field.key as string}
        value={field.value}
        disabled={field.disabled}
      />
    );
  }
  if (field.type === "color") {
    return (
      <Input
        className="border-0 shadow-none h-12 w-24 p-0"
        required={field.required ?? true}
        disabled={field.disabled}
        name={field.key as string}
        defaultValue={stringifyFieldValue(field.value)}
        type="color"
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        required={field.required ?? true}
        disabled={field.disabled}
        name={field.key as string}
        defaultValue={stringifyFieldValue(field.value)}
      />
    );
  }

  return (
    <Input
      required={field.required ?? true}
      disabled={field.disabled}
      name={field.key as string}
      defaultValue={stringifyFieldValue(field.value)}
      type={field.type}
    />
  );
}

export default function DataTableUpdateForm<T>(
  props: DataTableUpdateFormProps<T>,
) {
  const formId = useFormId();
  const { getLabel } = useFormOverrides();
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
              <Label
                htmlFor={field.key as string}
                data-form-id={formId}
                data-form-field-key={String(field.key)}
                data-form-default-label={
                  field.label ?? formatLabel(field.key as string)
                }
              >
                {getLabel(
                  formId,
                  String(field.key),
                  field.label ?? formatLabel(field.key as string),
                )}
              </Label>
              {updateField(
                {
                  ...field,
                  value: (props.record as Record<string, unknown>)[
                    String(field.key)
                  ] as T[keyof T],
                },
                field.label ?? formatLabel(field.key as string),
              )}
            </div>
          ))}
          <SubmitBtn
            text={
              <>
                <FaSave /> Update
              </>
            }
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
