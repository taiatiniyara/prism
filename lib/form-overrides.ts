// DEV form overrides — global, in-app editable overrides for DataTable form
// fields + column headers (labels now; field order in slice 2). Companion to the
// CSS styling overrides in lib/ui-style.ts, persisted the same way (a single
// scoped row in ui_style_override, DEV-gated to edit, applied for everyone).
//
// Keyed by (formId, fieldKey): formId is the settings route (usePathname), fieldKey
// is a DataTable field/column key — both stable, so an override survives restyling.

export interface FormFieldOverride {
  label?: string;
  order?: number; // slice 2 (drag-to-reorder); carried here so the store is stable
  width?: "half"; // slice 3 — "full" is the default (unset); "half" = compact column
  hidden?: boolean; // slice 4 — column visibility (tables); default shown
}

// formId -> fieldKey -> override
export type FormOverrideMap = Record<string, Record<string, FormFieldOverride>>;

const KEY_RE = /^[A-Za-z0-9 _./:-]{1,200}$/;

const cleanLabel = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  // allow empty string too? no — an empty override is a delete; caller prunes.
  return s.length > 0 && s.length <= 200 ? s : undefined;
};

const cleanOrder = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : undefined;
};

const cleanWidth = (v: unknown): "half" | undefined =>
  v === "half" ? "half" : undefined;

// Explicit boolean so a column can be forced shown (false) OR hidden (true),
// overriding its default; `undefined` means "use the column's default".
const cleanHidden = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : undefined;

export const sanitizeFormOverrides = (input: unknown): FormOverrideMap => {
  if (!input || typeof input !== "object") return {};
  const out: FormOverrideMap = {};
  for (const [formId, fields] of Object.entries(input as Record<string, unknown>)) {
    if (!KEY_RE.test(formId) || !fields || typeof fields !== "object") continue;
    const cleanedFields: Record<string, FormFieldOverride> = {};
    for (const [fieldKey, raw] of Object.entries(fields as Record<string, unknown>)) {
      if (!KEY_RE.test(fieldKey) || !raw || typeof raw !== "object") continue;
      const value = raw as Record<string, unknown>;
      const o: FormFieldOverride = {};
      const label = cleanLabel(value.label);
      const order = cleanOrder(value.order);
      const width = cleanWidth(value.width);
      const hidden = cleanHidden(value.hidden);
      if (label !== undefined) o.label = label;
      if (order !== undefined) o.order = order;
      if (width !== undefined) o.width = width;
      if (hidden !== undefined) o.hidden = hidden;
      if (Object.keys(o).length > 0) cleanedFields[fieldKey] = o;
    }
    if (Object.keys(cleanedFields).length > 0) out[formId] = cleanedFields;
  }
  return out;
};

// Resolve the display label for a field/column: DEV override wins, else the
// component's own default.
export const resolveLabel = (
  map: FormOverrideMap,
  formId: string,
  fieldKey: string,
  fallback: string,
): string => map[formId]?.[fieldKey]?.label ?? fallback;

// Field width: "full" (default) spans the row; "half" pairs into two columns.
export const resolveWidth = (
  map: FormOverrideMap,
  formId: string,
  fieldKey: string,
): "full" | "half" =>
  map[formId]?.[fieldKey]?.width === "half" ? "half" : "full";

// Column visibility. `defaultHidden` is the column's built-in default (declared
// columns default shown → false; other data fields default hidden → true); an
// explicit override wins.
export const resolveHidden = (
  map: FormOverrideMap,
  formId: string,
  fieldKey: string,
  defaultHidden = false,
): boolean => map[formId]?.[fieldKey]?.hidden ?? defaultHidden;

// Sort field/column keys by their DEV override order. Keys without an explicit
// order keep their original position (stable sort on the original index), so a
// form with no reordering renders exactly as the code declares it.
export const orderKeys = (
  map: FormOverrideMap,
  formId: string,
  keys: string[],
): string[] => {
  const fields = map[formId];
  if (!fields) return keys;
  return keys
    .map((key, index) => ({ key, index, order: fields[key]?.order ?? index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((e) => e.key);
};

// Persist a full ordering as explicit order=0..n-1 on every key (so the sort is
// unambiguous), preserving any existing label overrides.
export const setFieldOrder = (
  map: FormOverrideMap,
  formId: string,
  orderedKeys: string[],
): FormOverrideMap => {
  const next: FormOverrideMap = { ...map, [formId]: { ...map[formId] } };
  orderedKeys.forEach((key, index) => {
    next[formId][key] = { ...next[formId][key], order: index };
  });
  return next;
};

// Immutably set/clear one field's override, pruning empties so the store stays lean.
export const setFieldOverride = (
  map: FormOverrideMap,
  formId: string,
  fieldKey: string,
  patch: FormFieldOverride,
): FormOverrideMap => {
  const next: FormOverrideMap = { ...map, [formId]: { ...map[formId] } };
  const merged: FormFieldOverride = { ...next[formId][fieldKey], ...patch };
  // undefined patch values delete that property
  (Object.keys(patch) as (keyof FormFieldOverride)[]).forEach((k) => {
    if (patch[k] === undefined) delete merged[k];
  });
  if (Object.keys(merged).length === 0) {
    delete next[formId][fieldKey];
  } else {
    next[formId][fieldKey] = merged;
  }
  if (Object.keys(next[formId]).length === 0) delete next[formId];
  return next;
};
