"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type {
  InputDlMapBuilderResult,
  SaveInputDlMappingItem,
  InputDlMapCandidate,
} from "./service";

interface MapBuilderClientProps {
  result: InputDlMapBuilderResult;
  onAutoAcceptHigh: () => Promise<{
    success: boolean;
    message: string;
    savedCount: number;
  }>;
  onSaveMappings: (payload: { items: SaveInputDlMappingItem[] }) => Promise<{
    success: boolean;
    message: string;
    savedCount: number;
  }>;
}

export default function MapBuilderClient(props: MapBuilderClientProps) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const [draggingTrainingDlDefId, setDraggingTrainingDlDefId] = useState<
    string | null
  >(null);
  const [trainingSearch, setTrainingSearch] = useState("");
  const [inputSearch, setInputSearch] = useState("");
  const [optimisticTrainingIdsByInputId, setOptimisticTrainingIdsByInputId] =
    useState<Record<number, number[]>>({});

  const trainingById = useMemo(() => {
    return new Map(props.result.trainingDataLabels.map((dl) => [dl.id, dl]));
  }, [props.result.trainingDataLabels]);

  const sortedTrainingLabels = useMemo(
    () =>
      [...props.result.trainingDataLabels].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [props.result.trainingDataLabels],
  );

  const mappedInputNamesByTrainingId = useMemo(() => {
    const next = new Map<number, string[]>();
    for (const mapping of props.result.persistedMappings) {
      const existing = next.get(mapping.trainingDlDefId) ?? [];
      if (!existing.includes(mapping.inputName)) {
        existing.push(mapping.inputName);
      }
      next.set(mapping.trainingDlDefId, existing);
    }
    return next;
  }, [props.result.persistedMappings]);

  const persistedTrainingIdsByInputId = useMemo(() => {
    const next = new Map<number, number[]>();
    for (const mapping of props.result.persistedMappings) {
      const existing = next.get(mapping.inputId) ?? [];
      if (!existing.includes(mapping.trainingDlDefId)) {
        existing.push(mapping.trainingDlDefId);
      }
      next.set(mapping.inputId, existing);
    }
    return next;
  }, [props.result.persistedMappings]);

  const sortedInputRows = useMemo(
    () =>
      [...props.result.rows].sort((a, b) =>
        a.inputName.localeCompare(b.inputName),
      ),
    [props.result.rows],
  );

  const filteredTrainingLabels = useMemo(() => {
    const query = trainingSearch.trim().toLowerCase();
    if (!query) {
      return sortedTrainingLabels;
    }

    return sortedTrainingLabels.filter((dl) => {
      const haystack = `${dl.id} ${dl.name} ${dl.variable_name ?? ""}`
        .toLowerCase()
        .trim();
      return haystack.includes(query);
    });
  }, [sortedTrainingLabels, trainingSearch]);

  const filteredRows = useMemo(() => {
    const query = inputSearch.trim().toLowerCase();
    if (!query) {
      return sortedInputRows;
    }

    return sortedInputRows.filter((row) => {
      const haystack =
        `${row.inputId} ${row.inputName} ${row.inputVariableName ?? ""}`
          .toLowerCase()
          .trim();
      return haystack.includes(query);
    });
  }, [sortedInputRows, inputSearch]);

  const effectiveTrainingIdsByInputId = useMemo(() => {
    const next = new Map<number, number[]>();

    for (const [inputId, ids] of persistedTrainingIdsByInputId.entries()) {
      next.set(inputId, [...ids]);
    }

    for (const [inputIdText, ids] of Object.entries(
      optimisticTrainingIdsByInputId,
    )) {
      const inputId = Number(inputIdText);
      const existing = next.get(inputId) ?? [];
      for (const id of ids) {
        if (!existing.includes(id)) {
          existing.push(id);
        }
      }
      next.set(inputId, existing);
    }

    return next;
  }, [persistedTrainingIdsByInputId, optimisticTrainingIdsByInputId]);

  const mappedCount = useMemo(
    () =>
      filteredRows.filter((row) => {
        const mappedIds = effectiveTrainingIdsByInputId.get(row.inputId) ?? [];
        return mappedIds.length > 0;
      }).length,
    [filteredRows, effectiveTrainingIdsByInputId],
  );

  const buildManualCandidate = (
    trainingDlDefIdText: string,
  ): InputDlMapCandidate | null => {
    const id = Number(trainingDlDefIdText);
    if (!Number.isFinite(id)) {
      return null;
    }

    const dl = trainingById.get(id);
    if (!dl) {
      return null;
    }

    return {
      trainingDlDefId: dl.id,
      trainingDlLegacyId: String(dl.id),
      trainingSourceId: null,
      trainingName: dl.name,
      trainingVariableName: dl.variable_name,
      score: 0,
      confidence: "low",
      reasons: ["manual drag-drop"],
    };
  };

  const saveSingleMapping = (inputId: number, trainingDlDefIdText: string) => {
    const candidate = buildManualCandidate(trainingDlDefIdText);
    if (!candidate) {
      toast.error("Invalid training data label selected.");
      return;
    }

    setOptimisticTrainingIdsByInputId((prev) => {
      const existing = prev[inputId] ?? [];
      if (existing.includes(candidate.trainingDlDefId)) {
        return prev;
      }

      return {
        ...prev,
        [inputId]: [...existing, candidate.trainingDlDefId],
      };
    });

    startTransition(() => {
      void (async () => {
        const result = await props.onSaveMappings({
          items: [
            {
              inputId,
              candidate,
            },
          ],
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        router.refresh();
      })();
    });
  };

  const onDropToInput = (inputId: number) => {
    if (!draggingTrainingDlDefId) {
      return;
    }
    saveSingleMapping(inputId, draggingTrainingDlDefId);
    setDraggingTrainingDlDefId(null);
  };

  const [isAutoAccepting, startAutoAccept] = useTransition();

  const handleAutoAccept = () => {
    startAutoAccept(() => {
      void (async () => {
        const result = await props.onAutoAcceptHigh();
        if (result.success) {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      })();
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {props.result.stats.unmapped} unmapped / {props.result.stats.mappedHigh} high /{" "}
          {props.result.stats.mappedMedium} medium / {props.result.stats.mappedLow} low
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isAutoAccepting}
          onClick={handleAutoAccept}
        >
          {isAutoAccepting ? "Accepting..." : "Auto Accept High Confidence"}
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 p-3">
      <div className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Prism-Training Data Labels</h4>
          <span className="text-xs text-muted-foreground">
            {filteredTrainingLabels.length} / {sortedTrainingLabels.length}
          </span>
        </div>
        <input
          type="text"
          value={trainingSearch}
          onChange={(event) => setTrainingSearch(event.target.value)}
          placeholder="Search labels by id, name, variable"
          className="mb-2 w-full rounded border bg-background px-2 py-1 text-xs"
        />
        <div className="max-h-[70vh] space-y-2 overflow-auto">
          {filteredTrainingLabels.map((dl) => {
            const mappedInputNames =
              mappedInputNamesByTrainingId.get(dl.id) ?? [];
            const isMapped = mappedInputNames.length > 0;

            return (
              <div
                key={`training-dl-${dl.id}`}
                draggable
                onDragStart={() => setDraggingTrainingDlDefId(String(dl.id))}
                onDragEnd={() => setDraggingTrainingDlDefId(null)}
                className={`cursor-grab rounded border p-2 text-xs ${
                  isMapped ? "border-lime-400 bg-lime-100" : "bg-background"
                }`}
                title="Drag onto a prism input"
              >
                <div className="font-medium">
                  {dl.id} - {dl.name}
                </div>
                <div className="text-muted-foreground">
                  {dl.variable_name ?? ""}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                  {dl.category_name ? (
                    <span>{dl.category_name}</span>
                  ) : null}
                  {dl.subcategory_name ? (
                    <span>/ {dl.subcategory_name}</span>
                  ) : null}
                </div>
                {isMapped ? (
                  <div className="mt-1 text-[11px] text-emerald-700">
                    Mapped to: {mappedInputNames.join(", ")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Prism Input Definitions</h4>
          <span className="text-xs text-muted-foreground">
            Mapped {mappedCount} / {filteredRows.length}
          </span>
        </div>
        <input
          type="text"
          value={inputSearch}
          onChange={(event) => setInputSearch(event.target.value)}
          placeholder="Search inputs by id, name, variable"
          className="mb-2 w-full rounded border bg-background px-2 py-1 text-xs"
        />
        <div className="max-h-[70vh] space-y-2 overflow-auto">
          {filteredRows.map((row) => {
            const mappedIds =
              effectiveTrainingIdsByInputId.get(row.inputId) ?? [];
            const mappedDls = mappedIds
              .map((id) => trainingById.get(id))
              .filter((dl): dl is NonNullable<typeof dl> => Boolean(dl));
            const isMapped = mappedDls.length > 0;

            return (
              <div
                key={`input-${row.inputId}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropToInput(row.inputId);
                }}
                className={`rounded border p-2 text-xs ${
                  isMapped ? "border-lime-400 bg-lime-100" : "bg-background"
                }`}
              >
                <div className="font-medium">
                  {row.inputId} - {row.inputName}
                </div>
                <div className="text-muted-foreground">
                  {row.inputVariableName ?? ""}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {mappedDls.length > 0
                    ? `Mapped (${mappedDls.length}): ${mappedDls
                        .slice(0, 3)
                        .map((dl) => `${dl.id} - ${dl.name}`)
                        .join(", ")}${mappedDls.length > 3 ? ", ..." : ""}`
                    : "Drop a training data label here"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isSaving ? (
        <p className="text-xs text-muted-foreground lg:col-span-2">
          Saving mapping...
        </p>
      ) : null}
    </div>
    </div>
  );
}
