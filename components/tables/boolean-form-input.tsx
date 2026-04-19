"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface BooleanFormInputProps {
  name: string;
  disabled?: boolean;
  defaultValue?: boolean;
}

export default function BooleanFormInput(props: BooleanFormInputProps) {
  return (
    <Select
      name={props.name}
      disabled={props.disabled}
      defaultValue={
        typeof props.defaultValue === "boolean"
          ? String(props.defaultValue)
          : undefined
      }
    >
      <SelectTrigger className="w-full shadow">
        <SelectValue placeholder="Select Yes or No" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="true">Yes</SelectItem>
        <SelectItem value="false">No</SelectItem>
      </SelectContent>
    </Select>
  );
}
