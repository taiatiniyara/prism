"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/user.service";
import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import {
  measureDimensionScope,
  MEASURE_DIMENSIONS,
  MeasureDimension,
} from "@/db/schema/measureDimensionScope";

export interface MeasureScopeRow {
  measureId: number;
  measureName: string;
  measureVariableName: string;
  categoryName: string | null;
  dataTypeName: string | null;
  applicableDimensions: MeasureDimension[];
}

export async function getMeasureScopeViewModel(): Promise<{
  rows: MeasureScopeRow[];
  allDimensions: readonly string[];
}> {
  const user = await getCurrentUser();
  if (user.role !== "DEV") throw new Error("Unauthorized");

  const measures = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      variableName: measureDefinitions.variable_name,
      categoryId: measureDefinitions.measures_group_id,
      dataTypeId: measureDefinitions.data_type_id,
    })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true))
    .orderBy(measureDefinitions.name);

  const measureIds = measures.map((m) => m.id);
  const scopes =
    measureIds.length > 0
      ? await db
          .select()
          .from(measureDimensionScope)
          .where(inArray(measureDimensionScope.measure_id, measureIds))
      : [];

  const scopeMap = new Map<number, MeasureDimension[]>();
  for (const s of scopes) {
    if (s.expansion_mode === "not_applicable") continue;
    const dims = scopeMap.get(s.measure_id) ?? [];
    dims.push(s.dimension);
    scopeMap.set(s.measure_id, dims);
  }

  const rows: MeasureScopeRow[] = measures.map((m) => ({
    measureId: m.id,
    measureName: m.name,
    measureVariableName: m.variableName ?? "",
    categoryName: null,
    dataTypeName: null,
    applicableDimensions: scopeMap.get(m.id) ?? [],
  }));

  return {
    rows,
    allDimensions: MEASURE_DIMENSIONS as unknown as string[],
  };
}

export async function saveMeasureDimensionScope(
  measureId: number,
  dimension: string,
  isApplicable: boolean,
) {
  "use server";
  const user = await getCurrentUser();
  if (user.role !== "DEV") throw new Error("Unauthorized");

  const existing = await db
    .select({ id: measureDimensionScope.id })
    .from(measureDimensionScope)
    .where(
      and(
        eq(measureDimensionScope.measure_id, measureId),
        eq(measureDimensionScope.dimension, dimension as MeasureDimension),
      ),
    )
    .limit(1);

  const mode = isApplicable ? "by_context" : "not_applicable";
  if (existing.length > 0) {
    await db
      .update(measureDimensionScope)
      .set({ expansion_mode: mode })
      .where(eq(measureDimensionScope.id, existing[0].id));
  } else {
    await db.insert(measureDimensionScope).values({
      measure_id: measureId,
      dimension: dimension as MeasureDimension,
      expansion_mode: mode,
    });
  }

  revalidatePath("/settings/measure-scope");
}
