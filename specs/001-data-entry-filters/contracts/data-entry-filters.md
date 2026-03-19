# Contract: Data Entry Filters and Context

## Scope

This contract defines the server/client interface expectations for data-entry
filter context, option loading, and filtered input retrieval.

## Cookie Contract

Cookie keys:

- reportTypeId
- reportPeriodId
- inputCategoryId
- inputSubcategoryId
- serviceAreaId

Cookie semantics:

- Values are optional and treated as candidate defaults.
- Values must be validated on every request against authorized and cascade-valid
  option sets.
- Invalid values are removed and replaced with deterministic defaults.

## Server View-Model Contract

Response shape for data-entry page load (logical contract):

```ts
interface DataEntryFilterPageModel {
  context: {
    reportTypeId: number | null;
    reportPeriodId: number | null;
    inputCategoryId: number | null;
    inputSubcategoryId: number | null;
    serviceAreaId: number | null;
  };
  options: {
    reportTypes: { id: number; name: string }[];
    reportPeriods: { id: number; name: string }[];
    inputCategories: { id: number; name: string }[];
    inputSubcategories: { id: number; name: string }[];
    serviceAreas: { id: number; name: string }[];
  };
  ui: {
    showServiceAreaSelector: boolean;
    generationMode: boolean;
  };
  inputs:
    | {
        mode: "flat";
        rows: InputRow[];
      }
    | {
        mode: "grouped-by-generator";
        groups: GeneratorGroup[];
      };
}
```

Where:

```ts
interface InputRow {
  dataEntryId?: string;
  inputDefId: number;
  inputName: string;
  dataTypeId: number;
  controlType: "text" | "number" | "boolean" | "select" | "date" | "fallback";
  value: string | null;
  comments: string | null;
}

interface GeneratorGroup {
  generatorId: number;
  generatorName: string;
  serviceAreaId: number;
  rows: InputRow[];
}
```

## Behavioral Contract Rules

- Service area selector visibility:
- Must be visible only when selected category is Operational.
- Must be hidden for non-Operational categories.

- Generation mode behavior:
- Triggered when selected subcategory is Generation.
- Generator list must include only resources with `is_virtual = false` and
  matching selected service area.
- Inputs must render under each generator group.

- Cascade reset behavior:
- reportType change invalidates and recalculates reportPeriod.
- inputCategory change invalidates and recalculates subcategory and serviceArea.
- Any invalid downstream selection must be cleared before filtering rows.

## Error and Empty-State Contract

- Option-loading error: return page model with user-facing error state and no
  unsafe fallback values.
- No data for valid context: return empty-state model, not an exception.
- Unknown dataTypeId: return `controlType: "fallback"` and preserve row
  visibility.

## Authorization Contract

- All option and row retrieval must be scoped by authenticated user context.
- Cookie values must never bypass authorization constraints.
- Unauthorized or stale IDs must be sanitized before query execution.
