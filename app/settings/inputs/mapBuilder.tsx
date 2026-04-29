import SectionContainer from "@/components/layout/section-container";
import { db } from "@/db/connection";
import { inputDefinitions } from "@/db/schema/dataEntry";
import { asc } from "drizzle-orm";
import {
  AutoAcceptHighInputDlMappings,
  BuildInputDlMappingCandidates,
  SaveInputDlMappings,
} from "./service";
import MapBuilderClient from "@/app/settings/inputs/map-builder-client";

async function getLocalInputs() {
  return db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variable_name: inputDefinitions.variable_name,
    })
    .from(inputDefinitions)
    .orderBy(asc(inputDefinitions.id));
}

export default async function InputDlMapBuilder() {
  let result: Awaited<ReturnType<typeof BuildInputDlMappingCandidates>> | null =
    null;
  let errorMessage: string | null = null;

  let localInputs = await getLocalInputs();

  try {
    result = await BuildInputDlMappingCandidates();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to build mapping candidates.";
  }

  if (errorMessage) {
    return (
      <SectionContainer>
        <h3 className="text-base font-semibold">
          Input to Data Label Map Builder
        </h3>
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Ensure prism environment has PRISM_TRAINING_API_BASE_URL and (if set
          in training) PRISM_TRAINING_MIGRATION_KEY.
        </p>
      </SectionContainer>
    );
  }

  if (!result) {
    return null;
  }

  const fallbackRows = localInputs.map((input) => ({
    inputId: input.id,
    inputName: input.name,
    inputVariableName: input.variable_name,
    savedTrainingDlDefId: null,
    savedConfidence: null,
    bestCandidate: null,
    alternatives: [],
  }));

  const resolvedResult =
    result.rows.length > 0 || fallbackRows.length === 0
      ? result
      : {
          ...result,
          rows: fallbackRows,
          stats: {
            ...result.stats,
            inputsTotal: fallbackRows.length,
            unmapped: fallbackRows.length,
            mappedHigh: 0,
            mappedMedium: 0,
            mappedLow: 0,
          },
        };

  return (
    <SectionContainer>
      <div className="mb-4">
        <h3 className="text-base font-semibold">
          Input to Data Label Map Builder
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Prism input_definitions rows: {localInputs.length}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pulling active non-aggregated data-label-definitions from
          prism-training and scoring candidate matches for prism
          input_definitions.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Source endpoint: {result.source.endpoint}
        </p>
      </div>

      <div className="overflow-auto rounded border">
        <MapBuilderClient
          result={resolvedResult}
          onAutoAcceptHigh={AutoAcceptHighInputDlMappings}
          onSaveMappings={SaveInputDlMappings}
        />
      </div>

      {localInputs.length === 0 ? (
        <p className="mt-2 text-xs text-red-600">
          No rows found in prism.input_definitions.
        </p>
      ) : null}
    </SectionContainer>
  );
}
