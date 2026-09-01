"use client";

import { useMemo, useState } from "react";
import {
  History,
  Pencil,
  Plus,
  Users,
  CalendarClock,
  ArrowRight,
  ShieldCheck,
  TriangleAlert,
  Check,
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
  termLabel,
  type CommercialVersion,
  type DashboardKey,
  type Entitlements,
  type Plan,
  type Rights,
} from "./_data";

// ── helpers ──────────────────────────────────────────────────────────────────

const current = (p: Plan): CommercialVersion =>
  p.commercial.find((v) => v.validTo === null) ?? p.commercial[0];

const money = (n: number | null): string =>
  n == null ? "Free" : `US$${n.toLocaleString("en-US")}`;

const seats = (n: number | null): string => (n == null ? "Unlimited" : `${n}`);

const RIGHT_COLS: { key: keyof Rights; label: string }[] = [
  { key: "view", label: "View" },
  { key: "dlCharts", label: "Charts" },
  { key: "dlTables", label: "Tables" },
];

const rightsSummary = (e: Entitlements) => {
  const viewable = DASHBOARDS.filter((d) => e[d.key].view).length;
  const downloadable = DASHBOARDS.some(
    (d) => e[d.key].dlCharts || e[d.key].dlTables,
  );
  return { viewable, downloadable };
};

const entEqual = (a: Entitlements, b: Entitlements): boolean =>
  DASHBOARDS.every(
    (d) =>
      a[d.key].view === b[d.key].view &&
      a[d.key].dlCharts === b[d.key].dlCharts &&
      a[d.key].dlTables === b[d.key].dlTables,
  );

const cloneEnt = (e: Entitlements): Entitlements =>
  Object.fromEntries(
    DASHBOARDS.map((d) => [d.key, { ...e[d.key] }]),
  ) as Entitlements;

const todayISO = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const commercialDiff = (
  plan: Plan,
  v: CommercialVersion,
  prev: CommercialVersion | undefined,
): string[] => {
  if (!prev) return ["Initial version."];
  const out: string[] = [];
  if (v.priceUsd !== prev.priceUsd)
    out.push(`Price ${money(prev.priceUsd)} → ${money(v.priceUsd)}`);
  if (v.seatCap !== prev.seatCap)
    out.push(`Seats ${seats(prev.seatCap)} → ${seats(v.seatCap)}`);
  if (v.termDays !== prev.termDays)
    out.push(
      `Term ${termLabel(plan, prev.termDays)} → ${termLabel(plan, v.termDays)}`,
    );
  return out.length ? out : ["No commercial change recorded."];
};

interface CommercialDraft {
  priceUsd: number | null;
  seatCap: number | null;
  termDays: number | null;
  validFrom: string;
  note: string;
}

// ── entitlements grid (live / forward-apply) ─────────────────────────────────

function EntitlementsGrid({
  draft,
  canEdit,
  onToggle,
}: {
  draft: Entitlements;
  canEdit: boolean;
  onToggle: (dash: DashboardKey, right: keyof Rights) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="py-2 pr-3 text-left font-medium">Dashboard / report</th>
            {RIGHT_COLS.map((c) => (
              <th key={c.key} className="w-20 px-2 py-2 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DASHBOARDS.map((d) => (
            <tr key={d.key} className="border-border border-t">
              <td className="py-2 pr-3">{d.label}</td>
              {RIGHT_COLS.map((c) => (
                <td key={c.key} className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary,#4338ca)] disabled:opacity-40"
                    checked={draft[d.key][c.key]}
                    disabled={!canEdit}
                    aria-label={`${d.label} — ${c.label}`}
                    onChange={() => onToggle(d.key, c.key)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── manage dialog ────────────────────────────────────────────────────────────

function ManageDialog({
  plan,
  open,
  canEdit,
  onOpenChange,
  onPublishCommercial,
  onSaveEntitlements,
}: {
  plan: Plan;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (v: boolean) => void;
  onPublishCommercial: (planId: string, draft: CommercialDraft) => void;
  onSaveEntitlements: (planId: string, next: Entitlements) => void;
}) {
  const cur = current(plan);
  const isFree = plan.tierGroup === "free";

  // commercial draft (versioned)
  const [priceUsd, setPriceUsd] = useState<string>(
    cur.priceUsd == null ? "" : String(cur.priceUsd),
  );
  const [seatCap, setSeatCap] = useState<string>(
    cur.seatCap == null ? "" : String(cur.seatCap),
  );
  const [termDays, setTermDays] = useState<string>(
    cur.termDays == null ? "none" : String(cur.termDays),
  );
  const [validFrom, setValidFrom] = useState<string>(todayISO());
  const [note, setNote] = useState<string>("");

  // entitlements draft (live)
  const [entDraft, setEntDraft] = useState<Entitlements>(
    cloneEnt(plan.entitlements),
  );

  const commercialChanged = useMemo(() => {
    const p = priceUsd.trim() === "" ? null : Number(priceUsd);
    const s = seatCap.trim() === "" ? null : Number(seatCap);
    const t = termDays === "none" ? null : Number(termDays);
    return p !== cur.priceUsd || s !== cur.seatCap || t !== cur.termDays;
  }, [priceUsd, seatCap, termDays, cur]);

  const entChanged = !entEqual(entDraft, plan.entitlements);

  const publishCommercial = () =>
    onPublishCommercial(plan.id, {
      priceUsd: isFree || priceUsd.trim() === "" ? null : Number(priceUsd),
      seatCap: seatCap.trim() === "" ? null : Number(seatCap),
      termDays: termDays === "none" ? null : Number(termDays),
      validFrom,
      note: note.trim() || "(no note)",
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[56rem] max-w-none! overflow-y-auto p-6 sm:max-w-none!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {plan.name}
            <Badge variant={isFree ? "secondary" : "default"}>
              {isFree ? "Free" : "Paid"}
            </Badge>
            <code className="text-muted-foreground text-xs">{plan.code}</code>
          </DialogTitle>
          <DialogDescription>
            Commercial terms are versioned (subscribers keep what they were sold);
            entitlements are live and apply to everyone on the plan.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="commercial" className="mt-2">
          <TabsList>
            <TabsTrigger value="commercial">
              <Pencil /> Commercial terms
            </TabsTrigger>
            <TabsTrigger value="entitlements">
              <ShieldCheck /> Entitlements
            </TabsTrigger>
            <TabsTrigger value="history">
              <History /> History ({plan.commercial.length})
            </TabsTrigger>
          </TabsList>

          {/* COMMERCIAL — versioned */}
          <TabsContent value="commercial" className="mt-4 space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={isFree ? "" : priceUsd}
                  disabled={isFree || !canEdit}
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
                  disabled={!canEdit}
                  placeholder="Unlimited"
                  onChange={(e) => setSeatCap(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <select
                  value={termDays}
                  disabled={!canEdit}
                  onChange={(e) => setTermDays(e.target.value)}
                  className="border-border bg-background h-9 w-full rounded-md border px-2.5 text-sm disabled:opacity-50"
                >
                  <option value="365">Annual (365 days)</option>
                  <option value="60">60 days</option>
                  <option value="none">Rolling / unlimited</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={validFrom}
                  disabled={!canEdit}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Change note</Label>
                <Input
                  value={note}
                  disabled={!canEdit}
                  placeholder="Why is this changing? (shown in history)"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs">
              {commercialChanged
                ? "Publishing supersedes the current version (it gets an end date of the day before). Existing subscriptions keep the version they were sold — only new subscriptions use this one."
                : "Adjust price, seats, or term to publish a new version. Existing subscribers are never repriced."}
            </div>

            <div className="flex justify-end">
              <Button
                disabled={!commercialChanged || !canEdit}
                onClick={publishCommercial}
              >
                <Plus /> Publish new version
              </Button>
            </div>
          </TabsContent>

          {/* ENTITLEMENTS — live / forward-apply */}
          <TabsContent value="entitlements" className="mt-4 space-y-4">
            <EntitlementsGrid
              draft={entDraft}
              canEdit={canEdit}
              onToggle={(dash, right) =>
                setEntDraft((prev) => ({
                  ...prev,
                  [dash]: { ...prev[dash], [right]: !prev[dash][right] },
                }))
              }
            />
            <div className="border-border flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
              <TriangleAlert className="text-amber-600 mt-0.5 size-4 shrink-0" />
              <span className="text-muted-foreground">
                Entitlements are <strong>live</strong>. Saving applies immediately
                to all{" "}
                <strong>{plan.activeSubscribers} active subscribers</strong> on
                this plan — no new version, no re-pricing. (They keep their sold
                commercial terms.)
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={!entChanged || !canEdit}
                onClick={() => onSaveEntitlements(plan.id, entDraft)}
              >
                <Check /> Save entitlements
              </Button>
            </div>
          </TabsContent>

          {/* HISTORY — commercial versions */}
          <TabsContent value="history" className="mt-4">
            <p className="text-muted-foreground mb-3 text-xs">
              Version history covers <strong>commercial terms only</strong>.
              Entitlements are not versioned — they always reflect the current live
              set above.
            </p>
            <ol className="relative space-y-4 pl-4">
              {plan.commercial.map((v, i) => {
                const isCurrent = v.validTo === null;
                const changes = commercialDiff(plan, v, plan.commercial[i + 1]);
                return (
                  <li key={v.id} className="relative">
                    <span
                      className={
                        "ring-background absolute top-1.5 -left-4 size-2.5 rounded-full ring-2 " +
                        (isCurrent ? "bg-primary" : "bg-muted-foreground/40")
                      }
                    />
                    <div className="border-border rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {v.validFrom} → {v.validTo ?? "present"}
                        </span>
                        {isCurrent && <Badge>In force</Badge>}
                        <span className="text-muted-foreground text-sm">
                          {money(v.priceUsd)} · {seats(v.seatCap)} seats ·{" "}
                          {termLabel(plan, v.termDays)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {changes.map((c, j) => (
                          <Badge
                            key={j}
                            variant="outline"
                            className="font-normal"
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {v.note}
                      </p>
                      <p className="text-muted-foreground/70 mt-1 text-xs">
                        {v.createdBy} · {v.createdAt}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, onManage }: { plan: Plan; onManage: () => void }) {
  const cur = current(plan);
  const isFree = plan.tierGroup === "free";
  const { viewable, downloadable } = rightsSummary(plan.entitlements);
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
            <Users className="size-3.5" /> {seats(cur.seatCap)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" /> {termLabel(plan, cur.termDays)}
          </span>
          <span className="flex items-center gap-1">
            <History className="size-3.5" /> {plan.commercial.length} ver.
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="font-normal">
            {viewable}/{DASHBOARDS.length} dashboards
          </Badge>
          {downloadable && (
            <Badge variant="outline" className="font-normal">
              Downloads
            </Badge>
          )}
          <Badge variant="outline" className="font-normal">
            {plan.activeSubscribers} subs
          </Badge>
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

  const handlePublishCommercial = (planId: string, draft: CommercialDraft) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        const d = new Date(draft.validFrom);
        d.setDate(d.getDate() - 1);
        const supersededTo = d.toISOString().slice(0, 10);
        const newVersion: CommercialVersion = {
          id: `${p.code}_v${p.commercial.length + 1}`,
          validFrom: draft.validFrom,
          validTo: null,
          priceUsd: draft.priceUsd,
          seatCap: draft.seatCap,
          termDays: draft.termDays,
          createdBy: "You (prototype)",
          createdAt: todayISO(),
          note: draft.note,
        };
        const closed = p.commercial.map((v, i) =>
          i === 0 && v.validTo === null ? { ...v, validTo: supersededTo } : v,
        );
        return { ...p, commercial: [newVersion, ...closed] };
      }),
    );
    setOpenId(null);
  };

  const handleSaveEntitlements = (planId: string, next: Entitlements) => {
    // Live / forward-apply: replace the plan's entitlement set in place.
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, entitlements: next } : p)),
    );
    setOpenId(null);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Access Plans</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Tiered-access plans for PRISM. <strong>Commercial terms</strong>{" "}
            (price, seats, term) are versioned — subscribers keep what they were
            sold. <strong>Entitlements</strong> (which dashboards, and view vs
            download) are live and apply to everyone on the plan.
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
          onPublishCommercial={handlePublishCommercial}
          onSaveEntitlements={handleSaveEntitlements}
        />
      )}

      <p className="text-muted-foreground/70 text-xs">
        Prototype — mock data, no persistence. Backs onto #10&apos;s{" "}
        <code>plan</code> / <code>plan_version</code> (commercial) /{" "}
        <code>plan_entitlement</code> (live) tables once #2 lands the DDL.
      </p>
    </div>
  );
}
