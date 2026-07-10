export type ValueColumn =
  | "value_numeric"
  | "value_boolean"
  | "value_option_id"
  | "value_string";

const DATA_TYPE_TO_COLUMN: Record<string, ValueColumn> = {
  number: "value_numeric",
  numeric: "value_numeric",
  integer: "value_numeric",
  decimal: "value_numeric",
  boolean: "value_boolean",
  bool: "value_boolean",
  option: "value_option_id",
  select: "value_option_id",
  text: "value_string",
  string: "value_string",
};

export function resolveValueColumn(
  dataTypeName: string | null | undefined,
): ValueColumn | null {
  if (!dataTypeName) return null;
  const key = dataTypeName.trim().toLowerCase();
  return DATA_TYPE_TO_COLUMN[key] ?? null;
}

export interface TypedValue {
  valueNumeric: number | null;
  valueBoolean: boolean | null;
  valueOptionId: number | null;
  valueString: string | null;
}

export function pickTypedValue(
  column: ValueColumn,
  row: TypedValue,
): string | number | boolean | null {
  switch (column) {
    case "value_numeric":
      return row.valueNumeric;
    case "value_boolean":
      return row.valueBoolean;
    case "value_option_id":
      return row.valueOptionId;
    case "value_string":
      return row.valueString;
  }
}
