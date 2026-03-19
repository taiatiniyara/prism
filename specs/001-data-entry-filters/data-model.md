# Data Model: Data Entry Filters and Context

## Entity: FilterContext

Represents the active filter state used to retrieve and display data-entry rows.

Fields:

- reportTypeId: number | null
- reportPeriodId: number | null
- inputCategoryId: number | null
- inputSubcategoryId: number | null
- serviceAreaId: number | null

Validation rules:

- Each field must be either null or an integer ID present in the currently
  authorized option set.
- `reportPeriodId` must belong to the selected `reportTypeId` scope.
- `inputSubcategoryId` must belong to the selected `inputCategoryId` scope.
- `serviceAreaId` is required only when category is Operational; otherwise
  ignored/cleared.

State transitions:

- Initialize: cookie values -> validated defaults.
- Upstream change transition:
- reportTypeId change resets and recalculates reportPeriodId.
- inputCategoryId change resets and recalculates inputSubcategoryId and
  serviceAreaId.
- inputSubcategoryId change recalculates grouped/ungrouped input layout.
- serviceAreaId change recalculates active input set when service-area filtering
  is active.

## Entity: FilterOptions

Represents user-visible selectable values for each filter dimension.

Fields:

- reportTypes: Option[]
- reportPeriods: Option[]
- inputCategories: Option[]
- inputSubcategories: Option[]
- serviceAreas: Option[]

Option shape:

- id: number
- name: string
- metadata?: Record<string, unknown>

Validation rules:

- Option lists are authorization-scoped by current user.
- Option lists are cascade-scoped by upstream FilterContext selections.

## Entity: InputDefinitionView

Display-ready projection of input definition metadata.

Fields:

- inputDefId: number
- name: string
- categoryId: number
- subcategoryId: number
- dataTypeId: number
- dataTypeName: string
- isMandatory: boolean
- isCalculated: boolean
- unitLabel?: string

Validation rules:

- Must map to an existing input definition row.
- `dataTypeId` must resolve to a supported input renderer; unsupported values
  use fallback renderer state.

## Entity: GeneratorGroup

Grouping model used only when selected subcategory is Generation.

Fields:

- generatorId: number
- generatorName: string
- serviceAreaId: number
- isVirtual: boolean
- inputs: InputEntryRow[]

Validation rules:

- Include only rows where `isVirtual` is false.
- Include only generators matching selected serviceAreaId when service area is
  active.

## Entity: InputEntryRow

Represents a display and edit row for one input in current context.

Fields:

- dataEntryId?: string
- reportPeriodId: number
- serviceAreaId?: number
- energyResourceId?: number
- inputDefId: number
- value: string | null
- comments: string | null
- statusId?: number
- controlType: "text" | "number" | "boolean" | "select" | "date" | "fallback"

Validation rules:

- `inputDefId` must exist in filtered InputDefinitionView list.
- If grouped in Generation mode, `energyResourceId` must be set and belong to
  the displayed generator.
- controlType must be deterministically derived from `dataTypeId` mapping.

## Relationship Summary

- FilterContext determines FilterOptions and active InputDefinitionView set.
- FilterContext + user authorization determines InputEntryRow scope.
- In Generation mode, InputEntryRows are partitioned into GeneratorGroup
  entries.
- InputDefinitionView controls InputEntryRow.controlType.
