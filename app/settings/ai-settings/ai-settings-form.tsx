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
  AI_SOURCE_LABELS,
  secondaryOf,
  type AiPrimarySource,
} from "@/lib/ai/source-setting-constants";
import { updateAiPrimarySource } from "./service";

export default function AiSettingsForm({
  initialPrimary,
}: {
  initialPrimary: AiPrimarySource;
}) {
  const [primary, setPrimary] = useState<AiPrimarySource>(initialPrimary);
  const [saved, setSaved] = useState<AiPrimarySource>(initialPrimary);
  const [pending, startTransition] = useTransition();

  const secondary = secondaryOf(primary);
  const dirty = primary !== saved;

  const onSave = () => {
    startTransition(async () => {
      const res = await updateAiPrimarySource(primary);
      if (res.success) {
        setSaved(primary);
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
          onValueChange={(v) => setPrimary(v as AiPrimarySource)}
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
          financials, etc.).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>AI Secondary Source</Label>
        <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
          {AI_SOURCE_LABELS[secondary]}
        </div>
        <p className="text-xs text-muted-foreground">
          Automatically the source not selected as primary — used as
          fallback/verification. Not editable.
        </p>
      </div>

      <Button onClick={onSave} disabled={!dirty || pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
