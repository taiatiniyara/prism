"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createObjectiveLink,
  deleteObjectiveLink,
  fetchStrategyMap,
  setNodeMapDisplay,
} from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.client";
import type {
  StrategyMapNode,
  StrategyMapPerspective,
  StrategyMapResponse,
} from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.types";

// Layout constants (px; the canvas renders at natural size inside a scroll area,
// so pointer deltas map 1:1 to canvas coordinates — no CTM math needed).
const NW = 158;
const NH = 50;
const GAP = 16;
const THEME_GAP = 30;
const LABEL_W = 132;
const CONTENT_X = LABEL_W + 10;
const BAND_PAD_TOP = 24;
const BAND_PAD_BOT = 14;
const BAND_VGAP = 16;
// Vertical gap between a band's overall-objective header row and its body row.
const ROW_GAP = 30;
const MIN_W = 900;
const DRAG_THRESHOLD = 5;

// One ramp per perspective band, keyed by band order. Tailwind classes so they
// adapt to light/dark. Falls back to slate for any extra perspectives.
const BAND_COLORS = [
  { band: "bg-violet-500/5", bar: "bg-violet-500", chip: "border-violet-300 bg-violet-50 text-violet-900" },
  { band: "bg-sky-500/5", bar: "bg-sky-500", chip: "border-sky-300 bg-sky-50 text-sky-900" },
  { band: "bg-teal-500/5", bar: "bg-teal-500", chip: "border-teal-300 bg-teal-50 text-teal-900" },
  { band: "bg-amber-500/5", bar: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-900" },
  { band: "bg-slate-500/5", bar: "bg-slate-500", chip: "border-slate-300 bg-slate-50 text-slate-900" },
];

type Pos = { x: number; y: number };

type LaidNode = { node: StrategyMapNode; x: number; y: number };

type ThemeBox = { label: string | null; x: number; y: number; w: number };

type BandLayout = {
  perspective: StrategyMapPerspective;
  colorIndex: number;
  top: number;
  height: number;
  themes: ThemeBox[];
};

type Layout = {
  laid: Map<string, LaidNode>;
  bands: BandLayout[];
  width: number;
  height: number;
  perspectiveColor: Map<string, number>;
};

const computeLayout = (
  data: StrategyMapResponse,
  overrides: Map<string, Pos>,
): Layout => {
  const nodesByPersp = new Map<string, StrategyMapNode[]>();
  for (const n of data.nodes) {
    const arr = nodesByPersp.get(n.perspectiveId) ?? [];
    arr.push(n);
    nodesByPersp.set(n.perspectiveId, arr);
  }

  const laid = new Map<string, LaidNode>();
  const bands: BandLayout[] = [];
  const perspectiveColor = new Map<string, number>();
  let top = 0;
  let maxX = MIN_W;

  data.perspectives.forEach((p, idx) => {
    const colorIndex = Math.min(idx, BAND_COLORS.length - 1);
    perspectiveColor.set(p.id, colorIndex);
    const ns = nodesByPersp.get(p.id) ?? [];

    // Overall-objective map nodes render as a centered header row above the
    // band's body nodes (e.g. Financial's "Improve Shareholder Value" sits
    // above its key focus areas). Everything else flows in the body row.
    const headerNodes = ns
      .filter((n) => n.level === "overall_objective")
      .sort((a, b) => a.ord - b.ord);
    const bodyNodes = ns.filter((n) => n.level !== "overall_objective");
    const hasHeader = headerNodes.length > 0;

    // Group body nodes by theme (key focus area), ordered by themeOrd; untyped last.
    const groupsMap = new Map<
      string,
      { label: string | null; ord: number; nodes: StrategyMapNode[] }
    >();
    for (const n of bodyNodes) {
      const key = n.themeId ?? "__none__";
      const g = groupsMap.get(key) ?? {
        label: n.themeLabel,
        ord: n.themeId ? n.themeOrd : Number.MAX_SAFE_INTEGER,
        nodes: [],
      };
      g.nodes.push(n);
      groupsMap.set(key, g);
    }
    const groups = [...groupsMap.values()].sort((a, b) => a.ord - b.ord);

    const bodyRowY = top + BAND_PAD_TOP + (hasHeader ? NH + ROW_GAP : 0);
    let x = CONTENT_X;
    const themes: ThemeBox[] = [];

    for (const g of groups) {
      const startX = x;
      g.nodes.sort((a, b) => a.ord - b.ord);
      for (const n of g.nodes) {
        const ov = overrides.get(n.id);
        const placed: Pos =
          ov ??
          (n.x != null && n.y != null ? { x: n.x, y: n.y } : { x, y: bodyRowY });
        laid.set(n.id, { node: n, x: placed.x, y: placed.y });
        x += NW + GAP;
      }
      // Dedupe: when a theme holds a single node whose label equals the theme
      // (e.g. Financial's promoted key focus areas), drop the redundant caption.
      const redundant =
        g.nodes.length === 1 &&
        g.label != null &&
        g.nodes[0].label.trim().toLowerCase() === g.label.trim().toLowerCase();
      themes.push({
        label: redundant ? null : g.label,
        x: startX,
        y: bodyRowY - 19,
        w: Math.max(x - GAP - startX, NW),
      });
      x += THEME_GAP - GAP;
    }

    // Place header node(s) centered across the body's content width.
    if (hasHeader) {
      const headerRowY = top + BAND_PAD_TOP;
      const contentW = Math.max(x - (THEME_GAP - GAP) - CONTENT_X, NW);
      const totalW = headerNodes.length * NW + (headerNodes.length - 1) * GAP;
      let hx = CONTENT_X + Math.max(0, (contentW - totalW) / 2);
      for (const n of headerNodes) {
        const ov = overrides.get(n.id);
        const placed: Pos =
          ov ??
          (n.x != null && n.y != null
            ? { x: n.x, y: n.y }
            : { x: hx, y: headerRowY });
        laid.set(n.id, { node: n, x: placed.x, y: placed.y });
        hx += NW + GAP;
      }
    }

    const height =
      BAND_PAD_TOP + (hasHeader ? NH + ROW_GAP : 0) + NH + BAND_PAD_BOT;
    bands.push({ perspective: p, colorIndex, top, height, themes });
    maxX = Math.max(maxX, x);
    top += height + BAND_VGAP;
  });

  // Manually-positioned nodes may sit outside the auto flow — grow the canvas.
  for (const l of laid.values()) {
    maxX = Math.max(maxX, l.x + NW + 20);
    top = Math.max(top, l.y + NH + 20);
  }

  return { laid, bands, width: maxX + 20, height: top + 8, perspectiveColor };
};

const center = (l: LaidNode) => ({ x: l.x + NW / 2, y: l.y + NH / 2 });

export default function BscStrategyMap({
  canBuild = true,
}: {
  canBuild?: boolean;
}) {
  const [data, setData] = useState<StrategyMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, Pos>>(new Map());
  const [linkSource, setLinkSource] = useState<string | null>(null);

  // Drag bookkeeping (refs so pointer handlers don't re-render per move).
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    origin: Pos;
    moved: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const map = await fetchStrategyMap();
      setData(map);
      setOverrides(new Map());
      setLinkSource(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load strategy map.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const layout = useMemo(
    () => (data ? computeLayout(data, overrides) : null),
    [data, overrides],
  );

  const persistPosition = useCallback(async (id: string, pos: Pos) => {
    try {
      await setNodeMapDisplay(id, {
        mapX: Math.round(pos.x),
        mapY: Math.round(pos.y),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save position.");
    }
  }, []);

  const createLink = useCallback(
    async (sourceId: string, targetId: string) => {
      try {
        const result = await createObjectiveLink({
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          relation: "drives",
          note: null,
        });
        if (result.warning) toast.warning(result.warning);
        else toast.success("Link added.");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unable to add link.");
        setLinkSource(null);
      }
    },
    [load],
  );

  const onNodeClick = useCallback(
    (id: string) => {
      if (!canBuild) return;
      if (linkSource == null) {
        setLinkSource(id);
        return;
      }
      if (linkSource === id) {
        setLinkSource(null);
        return;
      }
      void createLink(linkSource, id);
    },
    [canBuild, linkSource, createLink],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent, l: LaidNode) => {
      if (!canBuild) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = {
        id: l.node.id,
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: l.x, y: l.y },
        moved: false,
      };
    },
    [canBuild],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    const next = { x: Math.max(0, d.origin.x + dx), y: Math.max(0, d.origin.y + dy) };
    setOverrides((prev) => {
      const m = new Map(prev);
      m.set(d.id, next);
      return m;
    });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved) {
        onNodeClick(d.id); // treat as a click (link interaction)
        return;
      }
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      void persistPosition(d.id, {
        x: Math.max(0, d.origin.x + dx),
        y: Math.max(0, d.origin.y + dy),
      });
    },
    [onNodeClick, persistPosition],
  );

  const onEdgeClick = useCallback(
    async (id: string) => {
      if (!canBuild) return;
      if (!window.confirm("Remove this cause-effect link?")) return;
      try {
        await deleteObjectiveLink(id);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unable to remove link.");
      }
    },
    [canBuild, load],
  );

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">Loading strategy map…</div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border bg-rose-50 p-3 text-xs text-rose-800">
        {error}
      </div>
    );
  }
  if (!data || !layout) return null;

  const empty = data.nodes.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {canBuild
            ? "Drag nodes to arrange. Click one node then another to link cause → effect; click a link to remove it."
            : "Read-only view of the strategy map."}
        </p>
        <div className="flex items-center gap-2">
          {linkSource ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setLinkSource(null)}
            >
              <Link2 className="mr-1 size-3" />
              Cancel link
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1 size-3" />
            Refresh
          </Button>
        </div>
      </div>

      {empty ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No map nodes yet. Select objectives in the Build view (and mark them as
          map nodes) to populate the strategy map.
        </div>
      ) : (
        <div className="overflow-auto rounded-md border bg-background">
          <div
            className="relative select-none"
            style={{ width: layout.width, height: layout.height }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Bands */}
            {layout.bands.map((b) => {
              const color = BAND_COLORS[b.colorIndex];
              return (
                <div key={b.perspective.id}>
                  <div
                    className={`absolute left-0 ${color.band}`}
                    style={{ top: b.top, width: layout.width, height: b.height }}
                  />
                  <div
                    className={`absolute ${color.bar}`}
                    style={{ top: b.top, left: 0, width: 4, height: b.height }}
                  />
                  <div
                    className="absolute text-xs font-medium text-foreground"
                    style={{ top: b.top + 8, left: 12, width: LABEL_W - 16 }}
                  >
                    {b.perspective.label}
                  </div>
                  {b.themes.map((t, i) =>
                    t.label ? (
                      <div
                        key={`${b.perspective.id}-theme-${i}`}
                        className="absolute truncate text-[10px] uppercase tracking-wide text-muted-foreground"
                        style={{ top: t.y, left: t.x, width: t.w }}
                        title={t.label}
                      >
                        {t.label}
                      </div>
                    ) : null,
                  )}
                </div>
              );
            })}

            {/* Edges */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={layout.width}
              height={layout.height}
            >
              <defs>
                <marker
                  id="bsc-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M2 1L8 5L2 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>
              </defs>
              {data.edges.map((edge) => {
                const s = layout.laid.get(edge.sourceId);
                const t = layout.laid.get(edge.targetId);
                if (!s || !t) return null;
                const sc = center(s);
                const tc = center(t);
                const dx = tc.x - sc.x;
                const dy = tc.y - sc.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                // stop short of both boxes so the arrow lands on the edge
                const x1 = sc.x + ux * (NH / 2 + 2);
                const y1 = sc.y + uy * (NH / 2 + 2);
                const x2 = tc.x - ux * (NH / 2 + 6);
                const y2 = tc.y - uy * (NH / 2 + 6);
                return (
                  <g key={edge.id} className="text-slate-400">
                    {/* wide invisible hit area for click-to-delete */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={12}
                      className={canBuild ? "pointer-events-auto cursor-pointer" : ""}
                      onClick={() => void onEdgeClick(edge.id)}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="currentColor"
                      strokeWidth={1.5}
                      markerEnd="url(#bsc-arrow)"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Nodes */}
            {[...layout.laid.values()].map((l) => {
              const colorIdx = layout.perspectiveColor.get(l.node.perspectiveId) ?? 4;
              const color = BAND_COLORS[colorIdx];
              const isSource = linkSource === l.node.id;
              return (
                <div
                  key={l.node.id}
                  className={`absolute flex items-center justify-center rounded-md border bg-background px-2 text-xs shadow-sm ${color.chip} ${
                    isSource ? "ring-2 ring-offset-1 ring-foreground" : ""
                  } ${canBuild ? "cursor-grab active:cursor-grabbing" : ""}`}
                  style={{ left: l.x, top: l.y, width: NW, height: NH }}
                  title={l.node.fullLabel}
                  onPointerDown={(e) => onPointerDown(e, l)}
                >
                  <span className="line-clamp-2 text-center leading-tight">
                    {l.node.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {linkSource ? (
        <p className="text-[11px] text-sky-700">
          Linking from “{layout.laid.get(linkSource)?.node.label ?? "…"}” — click
          a target node to draw the arrow.
        </p>
      ) : null}
    </div>
  );
}
