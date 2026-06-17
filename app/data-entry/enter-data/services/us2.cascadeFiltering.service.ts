import { DataEntryFilterContext } from "@/app/data-entry/constants";
import { applyFilterCascade } from "@/app/data-entry/filterContext.rules";
import {
  DataEntryFilterOption,
  DataEntryFilterOptions,
  DataEntryInputRowView,
} from "@/app/data-entry/types";
import { mapDataTypeToControlType } from "@/app/data-entry/inputControlType.mapper";
import { DataEntryComment, DataEntryStatusId } from "@/db/schema/dataEntry";

export interface InputDefinitionCandidate {
  id: number;
  name: string;
  alternativeNames: Record<string, string> | null;
  categoryId: number;
  subcategoryId: number;
  dataTypeId: number;
  dataTypeName: string | null;
  isMandatory?: boolean;
  validRangeMin?: number | null;
  validRangeMax?: number | null;
  validPolarityId?: number | null;
  validPolarityName?: string | null;
  unitName: string | null;
}

export interface DataEntryValueCandidate {
  id: string;
  inputDefId: number;
  serviceAreaId: number | null;
  statusId: number | null;
  updatedByName: string | null;
  updatedByRole: string | null;
  updatedAt: Date | null;
  value: string | null;
  comments: DataEntryComment[] | null;
}

const serializeComments = (
  comments: DataEntryComment[] | null,
): string | null => {
  if (!comments || comments.length === 0) {
    return null;
  }

  return JSON.stringify(comments);
};

const hasOption = (
  value: number | null,
  options: DataEntryFilterOption[] | undefined,
): boolean => value != null && (options?.some((option) => option.id === value) ?? false);

const ensureValidOrNull = (
  value: number | null,
  options: DataEntryFilterOption[] | undefined,
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
    | "reportPeriods"
    | "inputSubcategories"
    | "serviceAreas"
    | "dataEntryStatuses"
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
    dataEntryStatusId: ensureValidOrNull(
      cascaded.dataEntryStatusId,
      options.dataEntryStatuses,
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
  serviceAreaScopedInputDefIds: Set<number> = new Set<number>(),
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

      const isServiceAreaScoped = serviceAreaScopedInputDefIds.has(
        definition.id,
      );

      if (!isServiceAreaScoped) {
        return candidate.serviceAreaId == null;
      }

      if (context.serviceAreaId == null) {
        return candidate.serviceAreaId == null;
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
      dataTypeName: definition.dataTypeName,
      isMandatory: definition.isMandatory,
      validRangeMin: definition.validRangeMin,
      validRangeMax: definition.validRangeMax,
      validPolarityId: definition.validPolarityId,
      validPolarityName: definition.validPolarityName,
      controlType: mapDataTypeToControlType(definition.dataTypeName),
      isDataNotAvailable: entry?.statusId === DataEntryStatusId.Not_Available,
      updatedByName: entry?.updatedByName ?? null,
      updatedByRole: entry?.updatedByRole ?? null,
      updatedAt: entry?.updatedAt?.toISOString() ?? null,
      value: entry?.value ?? null,
      comments: serializeComments(entry?.comments ?? null),
    };
  });
};
