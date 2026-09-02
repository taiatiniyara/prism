"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AI_SECONDARY_LABELS,
  AI_SOURCE_LABELS,
  secondaryOf,
  type AiPrimarySource,
  type AiSecondarySource,
} from "@/lib/ai/source-setting-constants";
import { updateAiSourceConfig } from "./service";

export default function AiSettingsForm({
  initialPrimary,
  initialSecondary,
}: {
  initialPrimary: AiPrimarySource;
  initialSecondary: AiSecondarySource;
}) {
  const [primary, setPrimary] = useState<AiPrimarySource>(initialPrimary);
  const [secondary, setSecondary] = useState<AiSecondarySource>(initialSecondary);
  const [savedPrimary, setSavedPrimary] = useState<AiPrimarySource>(initialPrimary);
  const [savedSecondary, setSavedSecondary] =
    useState<AiSecondarySource>(initialSecondary);
  const [pending, startTransition] = useTransition();

  const other = secondaryOf(primary); // the only valid non-none secondary
  const dirty = primary !== savedPrimary || secondary !== savedSecondary;

  const onPrimaryChange = (v: AiPrimarySource) => {
    setPrimary(v);
    // keep the secondary valid: a concrete fallback follows the new "other" source;
    // "none" (isolation) is preserved.
    setSecondary((s) => (s === "none" ? "none" : secondaryOf(v)));
  };

  const onSave = () => {
    startTransition(async () => {
      const res = await updateAiSourceConfig(primary, secondary);
      if (res.success) {
        setSavedPrimary(primary);
        setSavedSecondary(secondary);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="ai-primary-source">AI Primary Source</Label>
        <Select
          value={primary}
          onValueChange={(v) => onPrimaryChange(v as AiPrimarySource)}
        >
          <SelectTrigger id="ai-primary-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webapp">{AI_SOURCE_LABELS.webapp}</SelectItem>
            <SelectItem value="powerbi">{AI_SOURCE_LABELS.powerbi}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          PRISM AI queries this source first for performance data (SAIDI, losses,
          financials, workforce, etc.).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai-secondary-source">AI Secondary Source</Label>
        <Select
          value={secondary}
          onValueChange={(v) => setSecondary(v as AiSecondarySource)}
        >
          <SelectTrigger id="ai-secondary-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{AI_SECONDARY_LABELS.none}</SelectItem>
            <SelectItem value={other}>{AI_SOURCE_LABELS[other]}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Fallback, used only when the primary can&apos;t answer. Choose{" "}
          <strong>None (primary only)</strong> to test the primary in isolation —
          the other source is then fully disabled for the AI (its tools are
          removed).
        </p>
      </div>

      <Button onClick={onSave} disabled={!dirty || pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
