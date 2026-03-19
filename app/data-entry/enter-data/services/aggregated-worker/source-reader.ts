import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";

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
): Promise<VariableMapping> => {
  if (variableNames.length === 0) {
    return {
      variableToInputDefId: new Map(),
      inputDefIds: [],
    };
  }

  const rows = await db
    .select({
      inputDefId: inputDefinitions.id,
      variableName: inputDefinitions.variable_name,
    })
    .from(inputDefinitions)
    .where(inArray(inputDefinitions.variable_name, variableNames));

  const variableToInputDefId = new Map<string, number>();
  for (const row of rows) {
    if (row.variableName) {
      variableToInputDefId.set(row.variableName, row.inputDefId);
    }
  }

  return {
    variableToInputDefId,
    inputDefIds: rows.map((row) => row.inputDefId),
  };
};

export const readSourceSnapshot = async (
  scope: AggregatedWorkerScope,
  variableNames: string[],
): Promise<SourceSnapshot> => {
  const mapping = await resolveVariableMappings(variableNames);

  if (mapping.inputDefIds.length === 0) {
    return {
      byVariable: {},
      byInputDefId: {},
    };
  }

  const conditions = [
    eq(dataEntries.report_period_id, scope.reportPeriodId),
    inArray(dataEntries.input_def_id, mapping.inputDefIds),
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
      inputDefId: dataEntries.input_def_id,
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
