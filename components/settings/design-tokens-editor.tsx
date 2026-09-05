"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DESIGN_TOKENS,
  type DesignTokenMap,
  type DesignTokenDef,
} from "@/lib/design-tokens";

const GROUPS: DesignTokenDef["group"][] = [
  "Brand & status",
  "Neutral",
  "Charts",
];

// Live-apply a token to the running page so the DEV sees the effect immediately.
const applyVar = (cssVar: string, hex: string | null) => {
  const root = document.documentElement;
  if (hex) root.style.setProperty(cssVar, hex);
  else root.style.removeProperty(cssVar);
};

export default function DesignTokensEditor() {
  const [tokens, setTokens] = useState<DesignTokenMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/design-tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { tokens?: DesignTokenMap }) => {
        if (cancelled) return;
        const t = data.tokens ?? {};
        setTokens(t);
        // Reflect saved overrides on this page immediately.
        for (const def of DESIGN_TOKENS) {
          if (t[def.key]) applyVar(def.cssVar, t[def.key]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const valueOf = (def: DesignTokenDef) => tokens[def.key] ?? def.fallback;

  const setToken = (def: DesignTokenDef, hex: string) => {
    setTokens((prev) => ({ ...prev, [def.key]: hex }));
    applyVar(def.cssVar, hex);
    setDirty(true);
  };

  const resetToken = (def: DesignTokenDef) => {
    setTokens((prev) => {
      const next = { ...prev };
      delete next[def.key];
      return next;
    });
    applyVar(def.cssVar, null);
    setDirty(true);
  };

  const resetAll = () => {
    for (const def of DESIGN_TOKENS) applyVar(def.cssVar, null);
    setTokens({});
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/design-tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      const body = (await res.json()) as { message?: string };
      if (res.ok) {
        toast.success(body.message ?? "Saved.");
        setDirty(false);
      } else {
        toast.error(body.message ?? "Save failed.");
      }
    } catch {
      toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading design tokens…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Design tokens</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            The brand palette used across the whole app. Edit a colour and it
            applies live here; <b>Save</b> to apply it for everyone. DEV only — no
            code change or deploy needed. Unset tokens fall back to the built-in
            default.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll}>
            Reset all
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Live preview strip */}
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 shadow-xs ring-1 ring-foreground/5">
        <span className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground">
          Brand
        </span>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
          Success
        </span>
        <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
          Warning
        </span>
        <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
          Danger
        </span>
        <span className="rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
          Info
        </span>
        <span className="mx-1 text-muted-foreground">·</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className="h-5 w-5 rounded-full ring-1 ring-foreground/10"
            style={{ background: `var(--chart-${n})` }}
            aria-hidden
          />
        ))}
      </div>

      {GROUPS.map((group) => (
        <section key={group} className="mt-7">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DESIGN_TOKENS.filter((d) => d.group === group).map((def) => {
              const overridden = tokens[def.key] != null;
              return (
                <div
                  key={def.key}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <input
                    type="color"
                    aria-label={def.label}
                    value={valueOf(def)}
                    onChange={(e) => setToken(def, e.target.value)}
                    className="h-8 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {def.label}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {valueOf(def)}
                      {overridden ? "" : " (default)"}
                    </div>
                  </div>
                  {overridden ? (
                    <button
                      type="button"
                      onClick={() => resetToken(def)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
