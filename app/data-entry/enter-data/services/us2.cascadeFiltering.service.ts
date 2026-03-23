import { DataEntryFilterContext } from "@/app/data-entry/constants";
import { applyFilterCascade } from "@/app/data-entry/filterContext.rules";
import {
  DataEntryFilterOption,
  DataEntryFilterOptions,
  DataEntryInputRowView,
} from "@/app/data-entry/types";
import { mapDataTypeToControlType } from "@/app/data-entry/inputControlType.mapper";
import { DataEntryComment } from "@/db/schema/dataEntry";

export interface InputDefinitionCandidate {
  id: number;
  name: string;
  categoryId: number;
  subcategoryId: number;
  dataTypeId: number;
  dataTypeName: string | null;
  unitName: string | null;
}

export interface DataEntryValueCandidate {
  id: string;
  inputDefId: number;
  serviceAreaId: number | null;
  value: string | null;
  comments: DataEntryComment[] | null;
}

const serializeComments = (comments: DataEntryComment[] | null): string | null => {
  if (!comments || comments.length === 0) {
    return null;
  }

  return JSON.stringify(comments);
};

const hasOption = (
  value: number | null,
  options: DataEntryFilterOption[],
): boolean => value != null && options.some((option) => option.id === value);

const ensureValidOrNull = (
  value: number | null,
  options: DataEntryFilterOption[],
): number | null => {
  if (value == null) {
    return null;
  }

  return hasOption(value, options) ? value : null;
};

export const applyCascadedContextWithOptionValidation = (
  current: DataEntryFilterContext,
  changedKey: keyof DataEntryFilterContext,
  nextValue: number | null,
  options: Pick<
    DataEntryFilterOptions,
    "reportPeriods" | "inputSubcategories" | "serviceAreas"
  >,
): DataEntryFilterContext => {
  const cascaded = applyFilterCascade(current, changedKey, nextValue);

  return {
    ...cascaded,
    reportPeriodId: ensureValidOrNull(
      cascaded.reportPeriodId,
      options.reportPeriods,
    ),
    inputSubcategoryId: ensureValidOrNull(
      cascaded.inputSubcategoryId,
      options.inputSubcategories,
    ),
    serviceAreaId: ensureValidOrNull(
      cascaded.serviceAreaId,
      options.serviceAreas,
    ),
  };
};

export const filterInputDefinitionsByContext = (
  definitions: InputDefinitionCandidate[],
  context: DataEntryFilterContext,
): InputDefinitionCandidate[] => {
  return definitions.filter((definition) => {
    if (
      context.inputCategoryId != null &&
      definition.categoryId !== context.inputCategoryId
    ) {
      return false;
    }

    if (
      context.inputSubcategoryId != null &&
      definition.subcategoryId !== context.inputSubcategoryId
    ) {
      return false;
    }

    return true;
  });
};

export const buildInputRowsFromDefinitions = (
  definitions: InputDefinitionCandidate[],
  entries: DataEntryValueCandidate[],
  context: DataEntryFilterContext,
): DataEntryInputRowView[] => {
  const validDefinitions = filterInputDefinitionsByContext(
    definitions,
    context,
  );

  return validDefinitions.map((definition) => {
    const entry = entries.find((candidate) => {
      if (candidate.inputDefId !== definition.id) {
        return false;
      }

      if (context.serviceAreaId == null) {
        return true;
      }

      return candidate.serviceAreaId === context.serviceAreaId;
    });

    return {
      dataEntryId: entry?.id,
      inputDefId: definition.id,
      energyResourceId: null,
      inputName: definition.name,
      unitName: definition.unitName,
      dataTypeId: 0,
      controlType: mapDataTypeToControlType(definition.dataTypeName),
      value: entry?.value ?? null,
      comments: serializeComments(entry?.comments ?? null),
    };
  });
};
