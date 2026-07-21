"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultDevValidationBuilderConfig,
  sanitizeDevValidationBuilderConfig,
} from "@/app/data-entry/enter-data/services/validation-builder/shared";
import {
  DevValidationBuilderConfig,
  ValidationCode,
  ValidationRuleName,
} from "@/app/data-entry/enter-data/services/validation-builder/types";
import {
  clearDevValidationBuilderConfig,
  resetDevValidationBuilderConfig,
  saveDevValidationBuilderConfig,
} from "./service";

type MeasureDefinitionOption = {
  id: number;
  name: string;
  dataType: string;
  isMandatory: boolean;
};

const RULE_LABELS: Array<{ key: ValidationRuleName; label: string }> = [
  { key: "required-value", label: "Required value" },
  { key: "data-type", label: "Data type" },
  { key: "relevance", label: "Relevance" },
  { key: "range-polarity", label: "Range / polarity" },
];

const CODE_LABELS: Array<{ key: ValidationCode; label: string }> = [
  { key: "REQUIRED", label: "Required" },
  { key: "INVALID_TYPE", label: "Invalid Type" },
  { key: "NOT_RELEVANT", label: "Not Relevant" },
  { key: "RANGE_OR_POLARITY", label: "Range / Polarity" },
];

export default function ValidationBuilderClient(props: {
  initialConfig: DevValidationBuilderConfig;
  measureDefinitions: MeasureDefinitionOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState<DevValidationBuilderConfig>(
    sanitizeDevValidationBuilderConfig(props.initialConfig),
  );
  const [inputSearch, setInputSearch] = useState("");
  const [selectedInputDefId, setSelectedInputDefId] = useState<number>(
    props.measureDefinitions[0]?.id ?? 0,
  );
  const [selectedCodes, setSelectedCodes] = useState<ValidationCode[]>([]);

  const filteredMeasureDefinitions = useMemo(() => {
    const search = inputSearch.trim().toLowerCase();
    if (!search) {
      return props.measureDefinitions;
    }
    return props.measureDefinitions.filter((item) =>
      item.name.toLowerCase().includes(search),
    );
  }, [inputSearch, props.measureDefinitions]);

  const getInputLabel = (inputDefId: number) =>
    props.measureDefinitions.find((item) => item.id === inputDefId)?.name ??
    `Input ${inputDefId}`;

  const toggleRule = (ruleName: ValidationRuleName, enabled: boolean) => {
    setConfig((prev) =>
      sanitizeDevValidationBuilderConfig({
        ...prev,
        ruleToggles: {
          ...prev.ruleToggles,
          [ruleName]: enabled,
        },
      }),
    );
  };

  const toggleExclusionCode = (code: ValidationCode, enabled: boolean) => {
    setSelectedCodes((prev) => {
      if (enabled) {
        if (prev.includes(code)) {
          return prev;
        }
        return [...prev, code];
      }
      return prev.filter((item) => item !== code);
    });
  };

  const addExclusion = () => {
    if (!selectedInputDefId || selectedCodes.length === 0) {
      toast.error("Select an input and at least one code.");
      return;
    }

    setConfig((prev) => {
      const existing = prev.dlDefExclusions.find(
        (item) => item.inputDefId === selectedInputDefId,
      );
      const nextExclusions = existing
        ? prev.dlDefExclusions.map((item) =>
            item.inputDefId === selectedInputDefId
              ? {
                  ...item,
                  codes: Array.from(new Set([...item.codes, ...selectedCodes])),
                }
              : item,
          )
        : [
            ...prev.dlDefExclusions,
            {
              inputDefId: selectedInputDefId,
              codes: selectedCodes,
            },
          ];

      return sanitizeDevValidationBuilderConfig({
        ...prev,
        dlDefExclusions: nextExclusions,
      });
    });

    setSelectedCodes([]);
  };

  const removeExclusion = (inputDefId: number) => {
    setConfig((prev) =>
      sanitizeDevValidationBuilderConfig({
        ...prev,
        dlDefExclusions: prev.dlDefExclusions.filter(
          (item) => item.inputDefId !== inputDefId,
        ),
      }),
    );
  };

  const saveConfig = () =>
    startTransition(() => {
      void (async () => {
        const result = await saveDevValidationBuilderConfig(config);
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
      })();
    });

  const resetConfig = () =>
    startTransition(() => {
      void (async () => {
        const result = await resetDevValidationBuilderConfig();
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        setConfig(defaultDevValidationBuilderConfig);
        toast.success(result.message);
      })();
    });

  const clearConfig = () =>
    startTransition(() => {
      void (async () => {
        const result = await clearDevValidationBuilderConfig();
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        setConfig(defaultDevValidationBuilderConfig);
        toast.success(result.message);
      })();
    });

  return (
    <div className="space-y-6 rounded-md border p-4">
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Global</h2>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig((prev) => ({
                ...prev,
                enabled: checked === true,
              }))
            }
          />
          <Label>Enable DEV validation builder overrides</Label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Rule toggles</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {RULE_LABELS.map((rule) => (
            <label
              key={rule.key}
              className="flex items-center gap-2 rounded border p-2 text-sm"
            >
              <Checkbox
                checked={config.ruleToggles[rule.key]}
                onCheckedChange={(checked) =>
                  toggleRule(rule.key, checked === true)
                }
              />
              <span>{rule.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Custom messages</h2>
        <div className="grid gap-3">
          {CODE_LABELS.map((code) => (
            <div
              key={code.key}
              className="space-y-1"
            >
              <Label>{code.label}</Label>
              <Input
                value={config.customMessages[code.key] ?? ""}
                placeholder={`Default: ${code.label}`}
                onChange={(event) =>
                  setConfig((prev) =>
                    sanitizeDevValidationBuilderConfig({
                      ...prev,
                      customMessages: {
                        ...prev.customMessages,
                        [code.key]: event.target.value,
                      },
                    }),
                  )
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Per-input exclusions</h2>
        <div className="grid gap-3 rounded border p-3">
          <div className="space-y-1">
            <Label>Find input definition</Label>
            <Input
              value={inputSearch}
              placeholder="Search input definitions..."
              onChange={(event) => setInputSearch(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Input definition</Label>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={selectedInputDefId}
              onChange={(event) =>
                setSelectedInputDefId(Number(event.target.value))
              }
            >
              {filteredMeasureDefinitions.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name} ({item.dataType}
                  {item.isMandatory ? ", required" : ""})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {CODE_LABELS.map((code) => (
              <label
                key={code.key}
                className="flex items-center gap-2 rounded border p-2 text-sm"
              >
                <Checkbox
                  checked={selectedCodes.includes(code.key)}
                  onCheckedChange={(checked) =>
                    toggleExclusionCode(code.key, checked === true)
                  }
                />
                <span>{code.label}</span>
              </label>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addExclusion}
            disabled={!selectedInputDefId || selectedCodes.length === 0}
          >
            Add exclusion
          </Button>
        </div>

        <div className="space-y-2">
          {config.dlDefExclusions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exclusions configured.
            </p>
          ) : (
            config.dlDefExclusions.map((item) => (
              <div
                key={item.inputDefId}
                className="flex items-center justify-between gap-3 rounded border p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {getInputLabel(item.inputDefId)}
                  </div>
                  <div className="text-muted-foreground">
                    {item.codes.join(", ")}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeExclusion(item.inputDefId)}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={saveConfig}
          disabled={isPending}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={resetConfig}
          disabled={isPending}
        >
          Reset defaults
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={clearConfig}
          disabled={isPending}
        >
          Clear stored config
        </Button>
      </div>
    </div>
  );
}
