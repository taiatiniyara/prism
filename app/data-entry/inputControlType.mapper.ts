import { DataEntryControlType } from "@/app/data-entry/types";

const CONTROL_TYPE_MAP: Record<string, DataEntryControlType> = {
  number: "number",
  numeric: "number",
  integer: "number",
  decimal: "number",
  text: "text",
  string: "text",
  boolean: "boolean",
  bool: "boolean",
  select: "select",
  option: "select",
  date: "date",
  datetime: "date",
  managedlists: "managedLists",
  "managed-lists": "managedLists",
  "managed list": "managedLists",
};

export const mapDataTypeToControlType = (
  dataTypeName: string | null | undefined,
): DataEntryControlType => {
  if (!dataTypeName) {
    return "fallback";
  }

  const key = dataTypeName.trim().toLowerCase();
  return CONTROL_TYPE_MAP[key] ?? "fallback";
};
