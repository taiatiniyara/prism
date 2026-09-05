"use client";

import { useCallback, useState } from "react";
import {
  AssignUnitToPowerStation,
  UnitSummary,
  RemoveUnitFromPowerStation,
} from "./service";

type PowerStation = {
  id: number;
  name: string;
};

type Props = {
  powerStations: PowerStation[];
  units: UnitSummary[];
};

export default function PowerStationDnD({
  powerStations: initialPowerStations,
  units: initialUnits,
}: Props) {
  const [units, setUnits] = useState(initialUnits);
  const [dragOverStationId, setDragOverStationId] = useState<
    number | "unassigned" | null
  >(null);
  const [draggedResourceId, setDraggedResourceId] = useState<number | null>(
    null,
  );

  const handleDragStart = useCallback((resourceId: number) => {
    setDraggedResourceId(resourceId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedResourceId(null);
    setDragOverStationId(null);
  }, []);

  const handleDrop = useCallback(
    async (targetStationId: number | "unassigned") => {
      if (draggedResourceId === null) return;

      const prev = [...units];
      setUnits((current) =>
        current.map((r) =>
          r.id === draggedResourceId
            ? {
                ...r,
                power_station_id:
                  targetStationId === "unassigned" ? null : targetStationId,
              }
            : r,
        ),
      );

      try {
        if (targetStationId === "unassigned") {
          await RemoveUnitFromPowerStation(draggedResourceId);
        } else {
          await AssignUnitToPowerStation(
            draggedResourceId,
            targetStationId,
          );
        }
      } catch {
        setUnits(prev);
      }

      setDraggedResourceId(null);
      setDragOverStationId(null);
    },
    [draggedResourceId, units],
  );

  const handleRemove = useCallback(
    async (resourceId: number) => {
      const prev = [...units];
      setUnits((current) =>
        current.map((r) =>
          r.id === resourceId ? { ...r, power_station_id: null } : r,
        ),
      );

      try {
        await RemoveUnitFromPowerStation(resourceId);
      } catch {
        setUnits(prev);
      }
    },
    [units],
  );

  const getAssignedResources = (stationId: number) =>
    units.filter((r) => r.power_station_id === stationId);

  const unassignedResources = units.filter(
    (r) => r.power_station_id === null,
  );

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 mt-4">
      <div className="space-y-4">
        {initialPowerStations.map((ps) => {
          const assigned = getAssignedResources(ps.id);
          const isOver = dragOverStationId === ps.id;

          return (
            <div
              key={ps.id}
              className={`border-2 rounded-lg transition-all ${
                isOver
                  ? "border-blue-500 bg-blue-50 scale-[1.01] shadow-lg"
                  : "border-slate-200 bg-white"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverStationId(ps.id);
              }}
              onDragLeave={() => setDragOverStationId(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(ps.id);
              }}
            >
              <div className="px-4 py-3 border-b bg-slate-50 rounded-t-lg flex items-center justify-between">
                <span className="font-semibold text-slate-800">{ps.name}</span>
                <span className="text-xs text-slate-400">
                  {assigned.length} resource
                  {assigned.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-3 min-h-[60px] flex flex-wrap gap-2 items-start">
                {assigned.length === 0 ? (
                  <p className="text-sm text-slate-400 italic w-full text-center py-2">
                    {isOver
                      ? "Release to assign resource"
                      : "Drag resources here"}
                  </p>
                ) : (
                  assigned.map((r) => (
                    <UnitChip
                      key={r.id}
                      resource={r}
                      isDragging={draggedResourceId === r.id}
                      onDragStart={() => handleDragStart(r.id)}
                      onDragEnd={handleDragEnd}
                      onRemove={() => handleRemove(r.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div
          className={`border-2 rounded-lg transition-all min-h-[200px] ${
            dragOverStationId === "unassigned"
              ? "border-danger/40 bg-danger/10"
              : "border-slate-200 bg-white"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverStationId("unassigned");
          }}
          onDragLeave={() => setDragOverStationId(null)}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop("unassigned");
          }}
        >
          <div className="px-4 py-3 border-b bg-slate-50 rounded-t-lg">
            <span className="font-semibold text-slate-700">
              Unassigned Resources
            </span>
            <span className="ml-2 text-xs text-slate-400">
              ({unassignedResources.length})
            </span>
          </div>

          <div className="p-3 flex flex-col gap-1">
            {unassignedResources.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-4">
                All energy resources assigned
              </p>
            ) : (
              unassignedResources.map((r) => (
                <UnitChip
                  key={r.id}
                  resource={r}
                  isDragging={draggedResourceId === r.id}
                  onDragStart={() => handleDragStart(r.id)}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnitChip({
  resource,
  isDragging,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  resource: UnitSummary;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(resource.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 px-2 py-1 rounded border bg-white cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging
          ? "opacity-40 border-dashed border-blue-300"
          : "border-slate-200 hover:border-blue-400 hover:shadow-sm"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700 truncate">
          {resource.name}
        </div>
        <div className="text-xs text-slate-400 flex gap-2">
          {resource.technology && <span>{resource.technology}</span>}
          {resource.category && <span>{resource.category}</span>}
          {resource.capacity_mw != null && (
            <span>{resource.capacity_mw} MW</span>
          )}
        </div>
      </div>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-slate-400 hover:text-danger transition-colors shrink-0 p-0.5 rounded hover:bg-danger/10"
          title="Remove from power station"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
