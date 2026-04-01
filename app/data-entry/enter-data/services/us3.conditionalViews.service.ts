import { DataEntryFilterContext } from "@/app/data-entry/constants";
import {
  DataEntryFilterOption,
  DataEntryGeneratorGroupView,
  DataEntryInputRowView,
} from "@/app/data-entry/types";
import { DataEntryComment, DataEntryStatusId } from "@/db/schema/dataEntry";

export const isOperationalContext = (
  context: DataEntryFilterContext,
  categories: DataEntryFilterOption[],
): boolean => {
  const operational = categories.find(
    (category) => category.name.trim().toLowerCase() === "operational",
  );

  return operational != null && context.inputCategoryId === operational.id;
};

export const isGenerationContext = (
  context: DataEntryFilterContext,
  subcategories: DataEntryFilterOption[],
): boolean => {
  const generation = subcategories.find(
    (subcategory) => subcategory.name.trim().toLowerCase() === "generation",
  );

  return generation != null && context.inputSubcategoryId === generation.id;
};

export interface GeneratorCandidate {
  id: number;
  name: string;
  serviceAreaId: number;
}

export interface GeneratorEntryCandidate {
  id: string;
  inputDefId: number;
  energyResourceId: number | null;
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

export const buildGenerationGroups = (
  generators: GeneratorCandidate[],
  definitionRows: DataEntryInputRowView[],
  entries: GeneratorEntryCandidate[],
): DataEntryGeneratorGroupView[] => {
  return generators.map((generator) => {
    const rows = definitionRows.map((definition) => {
      const entry = entries.find(
        (candidate) =>
          candidate.energyResourceId === generator.id &&
          candidate.inputDefId === definition.inputDefId,
      );

      return {
        ...definition,
        dataEntryId: entry?.id,
        energyResourceId: generator.id,
        isDataNotAvailable:
          entry?.statusId === DataEntryStatusId.DataNotAvailable,
        updatedByName: entry?.updatedByName ?? null,
        updatedByRole: entry?.updatedByRole ?? null,
        updatedAt: entry?.updatedAt?.toISOString() ?? null,
        value: entry?.value ?? null,
        comments: serializeComments(entry?.comments ?? null),
      };
    });

    return {
      generatorId: generator.id,
      generatorName: generator.name,
      serviceAreaId: generator.serviceAreaId,
      rows,
    };
  });
};
