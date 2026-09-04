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
const GAP = 16; // horizontal gap between sibling nodes
const ROW_V = 30; // vertical gap between levels within a perspective
const MAX_PER_ROW = 3; // objectives wrap into a grid at most this wide per cluster
const GRID_ROW_GAP = 12; // vertical gap between wrapped objective rows
const THEME_GAP = 34; // horizontal gap between theme clusters
const THEME_CAP_H = 16; // height reserved for a theme caption
const REGION_PAD = 14; // inner padding inside a perspective box
const REGION_TITLE_H = 26; // space for the perspective title
const REGION_GAP = 24; // gap between perspective boxes
const MIN_W = 900;
const DRAG_THRESHOLD = 5;

// One ramp per perspective, keyed by perspective order. Tailwind classes so they
// adapt to light/dark. Falls back to slate for any extra perspectives.
const BAND_COLORS = [
  { band: "border-violet-300 bg-violet-500/5", bar: "bg-violet-500", chip: "border-violet-300 bg-violet-50 text-violet-900" },
  { band: "border-sky-300 bg-sky-500/5", bar: "bg-sky-500", chip: "border-sky-300 bg-sky-50 text-sky-900" },
  { band: "border-teal-300 bg-teal-500/5", bar: "bg-teal-500", chip: "border-teal-300 bg-teal-50 text-teal-900" },
  { band: "border-amber-300 bg-amber-500/5", bar: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-900" },
  { band: "border-slate-300 bg-slate-500/5", bar: "bg-slate-500", chip: "border-slate-300 bg-slate-50 text-slate-900" },
];

type Pos = { x: number; y: number };

type LaidNode = { node: StrategyMapNode; x: number; y: number };

type ThemeBox = { label: string; x: number; y: number; w: number };

// A perspective rendered as a titled box (Kaplan & Norton quadrant frame).
type RegionBox = {
  perspective: StrategyMapPerspective;
  colorIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  themes: ThemeBox[];
};

type Layout = {
  laid: Map<string, LaidNode>;
  regions: RegionBox[];
  width: number;
  height: number;
  perspectiveColor: Map<string, number>;
};

type Slot = "tl" | "tr" | "mid" | "bottom" | "extra";

// Canonical strategy-map quadrants: Customer top-left, Financial top-right,
// Processes a full-width middle band, Learning & Growth a full-width bottom band.
const slotFor = (label: string): Slot => {
  const l = label.toLowerCase();
  if (l.includes("customer")) return "tl";
  if (l.includes("financial")) return "tr";
  if (l.includes("process")) return "mid";
  if (l.includes("learning") || l.includes("growth")) return "bottom";
  return "extra";
};

type RegionContent = {
  placements: Map<string, Pos>; // node id -> local position (origin = content top-left)
  themeCaps: ThemeBox[]; // local coords
  contentW: number;
  contentH: number;
};

// Lay out one perspective's nodes as a top-down tree in LOCAL coordinates:
// overall objective at the apex, key focus areas (when they are map nodes) as a
// row beneath, and the remaining objectives grouped into theme clusters below,
// each cluster captioned by its key focus area. Causal arrows then read upward.
const layoutPerspective = (nodes: StrategyMapNode[]): RegionContent => {
  const byOrd = (a: StrategyMapNode, b: StrategyMapNode) => a.ord - b.ord;
  const apex = nodes
    .filter((n) => n.level === "overall_objective")
    .sort(byOrd);
  const kfaChips = nodes
    .filter((n) => n.level === "key_focus_area")
    .sort(byOrd);
  const rest = nodes.filter(
    (n) => n.level !== "overall_objective" && n.level !== "key_focus_area",
  );

  type Col = {
    header: StrategyMapNode | null;
    caption: string | null;
    ord: number;
    objs: StrategyMapNode[];
  };
  const cols = new Map<string, Col>();
  for (const k of kfaChips) {
    cols.set(k.id, { header: k, caption: null, ord: k.ord, objs: [] });
  }
  for (const n of rest) {
    const key = n.themeId ?? "__none__";
    let c = cols.get(key);
    if (!c) {
      c = {
        header: null,
        caption: n.themeId ? n.themeLabel : null,
        ord: n.themeId ? n.themeOrd : Number.MAX_SAFE_INTEGER,
        objs: [],
      };
      cols.set(key, c);
    }
    c.objs.push(n);
  }
  const columns = [...cols.values()].sort((a, b) => a.ord - b.ord);
  for (const c of columns) c.objs.sort(byOrd);

  const hasApex = apex.length > 0;
  const hasHeaderChips = columns.some((c) => c.header != null);
  const hasCaptions = columns.some((c) => c.caption != null);

  // Stack the present levels: apex row, optional caption strip, header-chip row,
  // then the objectives row.
  let cy = 0;
  if (hasApex) cy += NH + ROW_V;
  let captionY = -1;
  if (hasCaptions) {
    captionY = cy;
    cy += THEME_CAP_H + 4;
  }
  let headerY = -1;
  if (hasHeaderChips) {
    headerY = cy;
    cy += NH + ROW_V;
  }
  const objY = cy;

  const placements = new Map<string, Pos>();
  const themeCaps: ThemeBox[] = [];
  let x = 0;
  for (const c of columns) {
    const n = c.objs.length;
    // Small clusters stay in one row; larger ones wrap into a near-square grid,
    // capped at MAX_PER_ROW, so wide perspectives (Processes, L&G) stay compact.
    const perRow =
      n <= 3 ? Math.max(n, 1) : Math.min(MAX_PER_ROW, Math.ceil(Math.sqrt(n)));
    const colW = Math.max(NW, perRow * NW + (perRow - 1) * GAP);
    if (n > 0) {
      const rowCount = Math.ceil(n / perRow);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const itemsInRow =
          row === rowCount - 1 ? n - row * perRow : perRow;
        const rowW = itemsInRow * NW + (itemsInRow - 1) * GAP;
        const rowStart = x + (colW - rowW) / 2; // center each (possibly partial) row
        placements.set(c.objs[i].id, {
          x: rowStart + col * (NW + GAP),
          y: objY + row * (NH + GRID_ROW_GAP),
        });
      }
    }
    if (c.header) {
      placements.set(c.header.id, {
        x: x + (colW - NW) / 2,
        y: headerY >= 0 ? headerY : objY,
      });
    }
    if (c.caption && captionY >= 0) {
      themeCaps.push({ label: c.caption, x, y: captionY, w: colW });
    }
    x += colW + THEME_GAP;
  }
  const contentW = Math.max(NW, x - THEME_GAP);

  if (hasApex) {
    const apexW = apex.length * NW + (apex.length - 1) * GAP;
    let ax = Math.max(0, (contentW - apexW) / 2);
    for (const a of apex) {
      placements.set(a.id, { x: ax, y: 0 });
      ax += NW + GAP;
    }
  }

  let contentH = 0;
  for (const p of placements.values()) contentH = Math.max(contentH, p.y + NH);

  return { placements, themeCaps, contentW, contentH };
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

  const perspectiveColor = new Map<string, number>();
  type Region = {
    persp: StrategyMapPerspective;
    colorIndex: number;
    slot: Slot;
    content: RegionContent;
    boxW: number;
    boxH: number;
    nodes: StrategyMapNode[];
  };
  const regionList: Region[] = [];
  data.perspectives.forEach((p, idx) => {
    const colorIndex = Math.min(idx, BAND_COLORS.length - 1);
    perspectiveColor.set(p.id, colorIndex);
    const ns = nodesByPersp.get(p.id) ?? [];
    const content = layoutPerspective(ns);
    regionList.push({
      persp: p,
      colorIndex,
      slot: slotFor(p.label),
      content,
      boxW: content.contentW + REGION_PAD * 2,
      boxH: REGION_TITLE_H + content.contentH + REGION_PAD * 2,
      nodes: ns,
    });
  });

  const bySlot = (s: Slot) => regionList.find((r) => r.slot === s);
  const tl = bySlot("tl");
  const tr = bySlot("tr");
  const mid = bySlot("mid");
  const bottom = bySlot("bottom");
  const extras = regionList.filter((r) => r.slot === "extra");

  const topRowW =
    (tl ? tl.boxW : 0) + (tl && tr ? REGION_GAP : 0) + (tr ? tr.boxW : 0);
  const canvasW = Math.max(
    MIN_W,
    topRowW,
    mid ? mid.content.contentW + REGION_PAD * 2 : 0,
    bottom ? bottom.content.contentW + REGION_PAD * 2 : 0,
    ...extras.map((e) => e.content.contentW + REGION_PAD * 2),
  );

  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  let topRowH = 0;
  if (tl) {
    boxes.set(tl.persp.id, { x: 0, y: 0, w: tl.boxW, h: tl.boxH });
    topRowH = Math.max(topRowH, tl.boxH);
  }
  if (tr) {
    // Sit Financial directly to the right of Customer so it stays on-screen even
    // when the full-width lower bands make the canvas much wider than the top row.
    const trX = tl ? tl.boxW + REGION_GAP : 0;
    boxes.set(tr.persp.id, { x: trX, y: 0, w: tr.boxW, h: tr.boxH });
    topRowH = Math.max(topRowH, tr.boxH);
  }
  let cursorY = topRowH > 0 ? topRowH + REGION_GAP : 0;
  const fullRow = (r: Region) => {
    boxes.set(r.persp.id, { x: 0, y: cursorY, w: canvasW, h: r.boxH });
    cursorY += r.boxH + REGION_GAP;
  };
  if (mid) fullRow(mid);
  if (bottom) fullRow(bottom);
  for (const e of extras) fullRow(e);
  let canvasH = Math.max(cursorY - REGION_GAP, topRowH);

  const laid = new Map<string, LaidNode>();
  const regions: RegionBox[] = [];
  for (const r of regionList) {
    const box = boxes.get(r.persp.id);
    if (!box) continue;
    // Left-align content in every box (sized and full-width) for a tidy read.
    const originX = box.x + REGION_PAD;
    const originY = box.y + REGION_TITLE_H + REGION_PAD;
    for (const n of r.nodes) {
      const local = r.content.placements.get(n.id);
      if (!local) continue;
      const base: Pos = { x: originX + local.x, y: originY + local.y };
      const ov = overrides.get(n.id);
      const pos = ov ?? (n.x != null && n.y != null ? { x: n.x, y: n.y } : base);
      laid.set(n.id, { node: n, x: pos.x, y: pos.y });
    }
    regions.push({
      perspective: r.persp,
      colorIndex: r.colorIndex,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      themes: r.content.themeCaps.map((t) => ({
        label: t.label,
        x: originX + t.x,
        y: originY + t.y,
        w: t.w,
      })),
    });
  }

  // Dragged nodes may sit outside the auto flow — grow the canvas.
  let width = canvasW;
  for (const l of laid.values()) {
    width = Math.max(width, l.x + NW + 20);
    canvasH = Math.max(canvasH, l.y + NH + 20);
  }

  return { laid, regions, width: width + 20, height: canvasH + 8, perspectiveColor };
};

const center = (l: LaidNode) => ({ x: l.x + NW / 2, y: l.y + NH / 2 });

// Point on the border of a node box (centered at c, size NW x NH) in the
// direction of (tx, ty) — so connectors start/end on the box edge, not its
// center (otherwise the arrowhead hides under the opaque node).
const borderToward = (
  c: { x: number; y: number },
  tx: number,
  ty: number,
): { x: number; y: number } => {
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: c.y };
  const sx = dx !== 0 ? NW / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? NH / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
};

// Curved (cubic Bézier) connector from the source box edge to the target box
// edge, leaving a small gap before the target so the arrowhead reads clearly.
const edgePath = (s: LaidNode, t: LaidNode): string => {
  const sc = center(s);
  const tc = center(t);
  const p1 = borderToward(sc, tc.x, tc.y);
  const p2raw = borderToward(tc, sc.x, sc.y);
  const bx = sc.x - tc.x;
  const by = sc.y - tc.y;
  const bl = Math.hypot(bx, by) || 1;
  // pull the end back ~6px toward the source so the arrowhead clears the box
  const p2 = { x: p2raw.x + (bx / bl) * 6, y: p2raw.y + (by / bl) * 6 };

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const k = 0.5;
  const c1 =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: p1.x + dx * k, y: p1.y }
      : { x: p1.x, y: p1.y + dy * k };
  const c2 =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: p2.x - dx * k, y: p2.y }
      : { x: p2.x, y: p2.y - dy * k };
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
};

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
    void (async () => {
      await load();
    })();
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
            ? "Drag nodes to arrange. Click one node then another to link cause → effect; click a link to remove it. Solid indigo arrows are mandatory PPA links (locked); your links are dashed."
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
            {/* Perspective boxes (quadrant frame) */}
            {layout.regions.map((b) => {
              const color = BAND_COLORS[b.colorIndex];
              return (
                <div key={b.perspective.id}>
                  <div
                    className={`absolute rounded-lg border ${color.band}`}
                    style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                  />
                  <div
                    className="absolute text-sm font-semibold text-foreground"
                    style={{ top: b.y + 6, left: b.x + 12 }}
                  >
                    {b.perspective.label}
                  </div>
                  {b.themes.map((t, i) => (
                    <div
                      key={`${b.perspective.id}-theme-${i}`}
                      className="absolute truncate text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      style={{ top: t.y, left: t.x, width: t.w }}
                      title={t.label}
                    >
                      {t.label}
                    </div>
                  ))}
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
                  viewBox="0 0 12 12"
                  refX="10"
                  refY="6"
                  markerWidth="12"
                  markerHeight="12"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M1 1 L11 6 L1 11 z" className="fill-slate-500" />
                </marker>
                <marker
                  id="bsc-arrow-locked"
                  viewBox="0 0 12 12"
                  refX="10"
                  refY="6"
                  markerWidth="12"
                  markerHeight="12"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M1 1 L11 6 L1 11 z" className="fill-indigo-500" />
                </marker>
              </defs>
              {data.edges.map((edge) => {
                const s = layout.laid.get(edge.sourceId);
                const t = layout.laid.get(edge.targetId);
                if (!s || !t) return null;
                const d = edgePath(s, t);
                // Master (locked) links read distinctly and can't be deleted by
                // the BLO; only utility-authored links are click-to-remove.
                const deletable = canBuild && !edge.locked;
                return (
                  <g
                    key={edge.id}
                    className={edge.locked ? "text-indigo-500" : "text-slate-400"}
                  >
                    {/* wide invisible hit area for click-to-delete */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      className={deletable ? "pointer-events-auto cursor-pointer" : ""}
                      onClick={
                        deletable ? () => void onEdgeClick(edge.id) : undefined
                      }
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeDasharray={edge.locked ? undefined : "5 4"}
                      markerEnd={
                        edge.locked
                          ? "url(#bsc-arrow-locked)"
                          : "url(#bsc-arrow)"
                      }
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
