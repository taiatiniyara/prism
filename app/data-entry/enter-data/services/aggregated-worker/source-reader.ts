import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";

export interface AggregatedWorkerScope {
  reportPeriodId: number;
  serviceAreaId?: number | null;
  energyResourceId?: number | null;
}

interface VariableMapping {
  variableToInputDefId: Map<string, number>;
  inputDefIds: number[];
}

export interface SourceSnapshot {
  byVariable: Record<string, string | null>;
  byInputDefId: Record<number, string | null>;
}

export const resolveVariableMappings = async (
  variableNames: string[],
  inputDefIds: number[],
): Promise<VariableMapping> => {
  if (variableNames.length === 0 && inputDefIds.length === 0) {
    return {
      variableToInputDefId: new Map(),
      inputDefIds: [],
    };
  }

  const conditions = [];

  if (variableNames.length > 0) {
    conditions.push(inArray(measureDefinitions.variable_name, variableNames));
  }

  if (inputDefIds.length > 0) {
    conditions.push(inArray(measureDefinitions.id, inputDefIds));
  }

  const rows = await db
    .select({
      inputDefId: measureDefinitions.id,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions)
    .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

  const resolvedInputDefIds = new Set<number>(inputDefIds);

  const variableToInputDefId = new Map<string, number>();
  for (const row of rows) {
    resolvedInputDefIds.add(row.inputDefId);

    if (row.variableName) {
      variableToInputDefId.set(row.variableName, row.inputDefId);
    }
  }

  return {
    variableToInputDefId,
    inputDefIds: [...resolvedInputDefIds],
  };
};

export const readSourceSnapshot = async (
  scope: AggregatedWorkerScope,
  variableNames: string[],
  inputDefIds: number[],
): Promise<SourceSnapshot> => {
  const mapping = await resolveVariableMappings(variableNames, inputDefIds);

  if (mapping.inputDefIds.length === 0) {
    return {
      byVariable: {},
      byInputDefId: {},
    };
  }

  const conditions = [
    eq(dataEntries.report_period_id, scope.reportPeriodId),
    inArray(dataEntries.measure_def_id, mapping.inputDefIds),
    eq(dataEntries.is_deleted, false),
  ];

  if (scope.serviceAreaId == null) {
    conditions.push(isNull(dataEntries.service_area_id));
  } else {
    conditions.push(eq(dataEntries.service_area_id, scope.serviceAreaId));
  }

  if (scope.energyResourceId == null) {
    conditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    conditions.push(eq(dataEntries.energy_resource_id, scope.energyResourceId));
  }

  const rows = await db
    .select({
      inputDefId: dataEntries.measure_def_id,
      value: dataEntries.value,
    })
    .from(dataEntries)
    .where(and(...conditions));

  const byInputDefId: Record<number, string | null> = {};
  rows.forEach((row) => {
    byInputDefId[row.inputDefId] = row.value;
  });

  const byVariable: Record<string, string | null> = {};
  for (const variableName of variableNames) {
    const mappedInputDefId = mapping.variableToInputDefId.get(variableName);
    if (mappedInputDefId == null) {
      continue;
    }

    byVariable[variableName] = byInputDefId[mappedInputDefId] ?? null;
  }

  return {
    byVariable,
    byInputDefId,
  };
};
