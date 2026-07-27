"use client";

import { useMemo, useState } from "react";
import {
  History,
  Pencil,
  ArrowRight,
  Plus,
  CircleDollarSign,
  Users,
  CalendarClock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DASHBOARDS,
  SEED_PLANS,
  type DashboardKey,
  type EntitlementLevel,
  type Entitlements,
  type Plan,
  type PlanVersion,
} from "./_data";

// ── helpers ──────────────────────────────────────────────────────────────────

const currentVersion = (plan: Plan): PlanVersion =>
  plan.versions.find((v) => v.effectiveTo === null) ?? plan.versions[0];

const money = (n: number | null): string =>
  n == null ? "Free" : `US$${n.toLocaleString("en-US")}`;

const term = (d: number | null): string =>
  d == null ? "Rolling" : d === 365 ? "Annual" : `${d} days`;

const ENT_LABEL: Record<EntitlementLevel, string> = {
  none: "Off",
  view: "View",
  view_download: "View + Download",
};

const ENT_ORDER: EntitlementLevel[] = ["none", "view", "view_download"];

const todayISO = (): string => {
  // Local date (not UTC) — a plan's effective-from should be the editor's today,
  // and PRISM's users sit at UTC+12/13, where toISOString() lands a day early.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const countIncluded = (e: Entitlements): number =>
  DASHBOARDS.filter((d) => e[d.key] !== "none").length;

const hasDownload = (e: Entitlements): boolean =>
  DASHBOARDS.some((d) => e[d.key] === "view_download");

// human-readable diff between a version and the one it superseded
const diffVersions = (v: PlanVersion, prev: PlanVersion | undefined): string[] => {
  if (!prev) return ["Initial version."];
  const out: string[] = [];
  if (v.priceUsd !== prev.priceUsd)
    out.push(`Price ${money(prev.priceUsd)} → ${money(v.priceUsd)}`);
  if (v.seatCap !== prev.seatCap)
    out.push(`Seats ${prev.seatCap} → ${v.seatCap}`);
  if (v.termDays !== prev.termDays)
    out.push(`Term ${term(prev.termDays)} → ${term(v.termDays)}`);
  for (const d of DASHBOARDS) {
    if (v.entitlements[d.key] !== prev.entitlements[d.key]) {
      out.push(
        `${d.label}: ${ENT_LABEL[prev.entitlements[d.key]]} → ${ENT_LABEL[v.entitlements[d.key]]}`,
      );
    }
  }
  return out.length ? out : ["No field changes recorded."];
};

// ── entitlement segmented control ────────────────────────────────────────────

function EntitlementPicker({
  value,
  onChange,
}: {
  value: EntitlementLevel;
  onChange: (v: EntitlementLevel) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {ENT_ORDER.map((lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onChange(lvl)}
          className={
            "px-2.5 py-1 text-xs font-medium transition-colors " +
            (value === lvl
              ? lvl === "none"
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted")
          }
        >
          {ENT_LABEL[lvl]}
        </button>
      ))}
    </div>
  );
}

// ── manage dialog (overview + edit + history) ────────────────────────────────

function ManageDialog({
  plan,
  open,
  canEdit,
  onOpenChange,
  onPublish,
}: {
  plan: Plan;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (v: boolean) => void;
  onPublish: (planId: string, draft: DraftVersion) => void;
}) {
  const cur = currentVersion(plan);
  const isFree = plan.tierGroup === "free";

  const [priceUsd, setPriceUsd] = useState<string>(
    cur.priceUsd == null ? "" : String(cur.priceUsd),
  );
  const [seatCap, setSeatCap] = useState<string>(String(cur.seatCap));
  const [termDays, setTermDays] = useState<string>(
    cur.termDays == null ? "rolling" : String(cur.termDays),
  );
  const [entitlements, setEntitlements] = useState<Entitlements>({
    ...cur.entitlements,
  });
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayISO());
  const [note, setNote] = useState<string>("");

  const changed = useMemo(() => {
    const p = priceUsd.trim() === "" ? null : Number(priceUsd);
    return (
      p !== cur.priceUsd ||
      Number(seatCap) !== cur.seatCap ||
      (termDays === "rolling" ? null : Number(termDays)) !== cur.termDays ||
      DASHBOARDS.some((d) => entitlements[d.key] !== cur.entitlements[d.key])
    );
  }, [priceUsd, seatCap, termDays, entitlements, cur]);

  const publish = () => {
    onPublish(plan.id, {
      priceUsd: isFree || priceUsd.trim() === "" ? null : Number(priceUsd),
      seatCap: Number(seatCap) || 0,
      termDays: termDays === "rolling" ? null : Number(termDays),
      entitlements,
      effectiveFrom,
      note: note.trim() || "(no note)",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[54rem] max-w-none! overflow-y-auto p-6 sm:max-w-none!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {plan.name}
            <Badge variant={isFree ? "secondary" : "default"}>
              {isFree ? "Free" : "Paid"}
            </Badge>
            <code className="text-muted-foreground text-xs">{plan.code}</code>
          </DialogTitle>
          <DialogDescription>
            Editing publishes a new dated version — it never overwrites history.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="edit" className="mt-2">
          <TabsList>
            <TabsTrigger value="edit">
              <Pencil /> Current &amp; edit
            </TabsTrigger>
            <TabsTrigger value="history">
              <History /> Version history ({plan.versions.length})
            </TabsTrigger>
          </TabsList>

          {/* EDIT */}
          <TabsContent value="edit" className="mt-4 space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={isFree ? "" : priceUsd}
                  disabled={isFree}
                  placeholder={isFree ? "Free" : "e.g. 2200"}
                  onChange={(e) => setPriceUsd(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Seat cap</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={seatCap}
                  onChange={(e) => setSeatCap(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <select
                  value={termDays}
                  onChange={(e) => setTermDays(e.target.value)}
                  className="border-border bg-background h-9 w-full rounded-md border px-2.5 text-sm"
                >
                  <option value="365">Annual (365 days)</option>
                  <option value="60">60 days</option>
                  <option value="rolling">Rolling / no fixed term</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Dashboard entitlements</Label>
              <div className="divide-border border-border divide-y rounded-lg border">
                {DASHBOARDS.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-sm">{d.label}</span>
                    <EntitlementPicker
                      value={entitlements[d.key]}
                      onChange={(v) =>
                        setEntitlements((prev) => ({
                          ...prev,
                          [d.key as DashboardKey]: v,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Change note</Label>
                <Input
                  value={note}
                  placeholder="Why is this changing? (shown in history)"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs">
              {changed
                ? "Publishing supersedes the current version: it gets an end date of the day before, and this becomes the in-force version."
                : "No changes yet — adjust a field to publish a new version."}
            </div>
          </TabsContent>

          {/* HISTORY */}
          <TabsContent value="history" className="mt-4">
            <ol className="relative space-y-4 pl-4">
              {plan.versions.map((v, i) => {
                const isCurrent = v.effectiveTo === null;
                const changes = diffVersions(v, plan.versions[i + 1]);
                return (
                  <li key={v.id} className="relative">
                    <span
                      className={
                        "absolute -left-4 top-1.5 size-2.5 rounded-full ring-2 ring-background " +
                        (isCurrent ? "bg-primary" : "bg-muted-foreground/40")
                      }
                    />
                    <div className="border-border rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {v.effectiveFrom} → {v.effectiveTo ?? "present"}
                        </span>
                        {isCurrent && (
                          <Badge variant="default">In force</Badge>
                        )}
                        <span className="text-muted-foreground text-sm">
                          {money(v.priceUsd)} · {v.seatCap} seats · {term(v.termDays)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {changes.map((c, j) => (
                          <Badge key={j} variant="outline" className="font-normal">
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {v.note}
                      </p>
                      <p className="text-muted-foreground/70 mt-1 text-xs">
                        Changed by {v.changedBy} on {v.changedAt}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!changed || !canEdit} onClick={publish}>
            <Plus /> {canEdit ? "Publish new version" : "Read-only"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// draft shape passed up on publish
export interface DraftVersion {
  priceUsd: number | null;
  seatCap: number;
  termDays: number | null;
  entitlements: Entitlements;
  effectiveFrom: string;
  note: string;
}

// ── plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, onManage }: { plan: Plan; onManage: () => void }) {
  const cur = currentVersion(plan);
  const isFree = plan.tierGroup === "free";
  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{plan.name}</h3>
              <Badge variant={isFree ? "secondary" : "default"}>
                {isFree ? "Free" : "Paid"}
              </Badge>
            </div>
            <code className="text-muted-foreground text-xs">{plan.code}</code>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">{money(cur.priceUsd)}</div>
            {!isFree && (
              <div className="text-muted-foreground text-xs">per term</div>
            )}
          </div>
        </div>

        <div className="text-muted-foreground grid grid-cols-3 gap-2 text-xs">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {cur.seatCap} seats
          </span>
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" /> {term(cur.termDays)}
          </span>
          <span className="flex items-center gap-1">
            <CircleDollarSign className="size-3.5" />
            {plan.versions.length} ver.
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="font-normal">
            {countIncluded(cur.entitlements)} dashboards
          </Badge>
          {hasDownload(cur.entitlements) && (
            <Badge variant="outline" className="font-normal">
              Downloadable
            </Badge>
          )}
          {!plan.isActive && (
            <Badge variant="destructive" className="font-normal">
              Inactive
            </Badge>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onManage}
        >
          Manage <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

// ── root ─────────────────────────────────────────────────────────────────────

export default function AccessPlansClient({ canEdit }: { canEdit: boolean }) {
  const [plans, setPlans] = useState<Plan[]>(SEED_PLANS);
  const [openId, setOpenId] = useState<string | null>(null);

  const openPlan = plans.find((p) => p.id === openId) ?? null;

  const handlePublish = (planId: string, draft: DraftVersion) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        const supersededTo = (() => {
          const d = new Date(draft.effectiveFrom);
          d.setDate(d.getDate() - 1);
          return d.toISOString().slice(0, 10);
        })();
        const newVersion: PlanVersion = {
          id: `${p.code}_v${p.versions.length + 1}`,
          effectiveFrom: draft.effectiveFrom,
          effectiveTo: null,
          priceUsd: draft.priceUsd,
          seatCap: draft.seatCap,
          termDays: draft.termDays,
          entitlements: draft.entitlements,
          changedBy: "You (prototype)",
          changedAt: todayISO(),
          note: draft.note,
        };
        const oldVersions = p.versions.map((v, i) =>
          i === 0 && v.effectiveTo === null
            ? { ...v, effectiveTo: supersededTo }
            : v,
        );
        return { ...p, versions: [newVersion, ...oldVersions] };
      }),
    );
    setOpenId(null);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Access Plans</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tiered-access plans for PRISM. Prices and terms are versioned — every
            edit publishes a new dated version and the old one is retained.
          </p>
        </div>
        <Badge variant="secondary">DEV / BMO</Badge>
      </div>

      {!canEdit && (
        <div className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
          You have read-only access to plans. Editing is limited to DEV and BMO
          roles.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} onManage={() => setOpenId(p.id)} />
        ))}
      </div>

      {openPlan && (
        <ManageDialog
          plan={openPlan}
          open={openId !== null}
          canEdit={canEdit}
          onOpenChange={(v) => setOpenId(v ? openPlan.id : null)}
          onPublish={handlePublish}
        />
      )}

      <p className="text-muted-foreground/70 text-xs">
        Prototype — mock data, no persistence. Backs onto #10&apos;s{" "}
        <code>plan</code> / <code>plan_version</code> /{" "}
        <code>plan_entitlement</code> tables once #2 lands the DDL.
      </p>
    </div>
  );
}
