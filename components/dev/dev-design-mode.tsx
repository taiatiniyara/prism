"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { generateUiCss } from "@/lib/ui-style";
import type { UiElementStyle, UiStyleMap } from "@/lib/ui-style";

// Build a reasonably-stable CSS selector for a clicked element.
const computeSelector = (start: Element): string => {
  const safeId = (el: Element) =>
    el.id && /^[A-Za-z][\w-]*$/.test(el.id) ? `#${el.id}` : null;

  const startId = safeId(start);
  if (startId) return startId;

  const parts: string[] = [];
  let node: Element | null = start;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < 6) {
    const tag = node.tagName.toLowerCase();
    if (tag === "body" || tag === "html") break;
    const id = safeId(node);
    if (id) {
      parts.unshift(id);
      break;
    }
    let part = tag;
    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node!.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
    depth += 1;
  }
  return parts.join(" > ");
};

const HOVER_CSS = `
body[data-dev-design="on"] *:hover{outline:1px dashed #6366f1 !important;outline-offset:-1px;cursor:crosshair !important;}
body[data-dev-design="on"] [data-dev-ui] *:hover{outline:none !important;cursor:auto !important;}
`;

export default function DevDesignMode() {
  const [styles, setStyles] = useState<UiStyleMap>({});
  const [canEdit, setCanEdit] = useState(false);
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const stylesRef = useRef<UiStyleMap>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stylesRef.current = styles;
  }, [styles]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/ui-style", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          styles: UiStyleMap;
          canEdit: boolean;
        };
        if (!alive) return;
        setStyles(data.styles ?? {});
        setCanEdit(Boolean(data.canEdit));
      } catch {
        /* styling overrides are optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Toggle hover affordance.
  useEffect(() => {
    document.body.dataset.devDesign = active ? "on" : "";
    return () => {
      document.body.dataset.devDesign = "";
    };
  }, [active]);

  // Intercept clicks while design mode is on.
  useEffect(() => {
    if (!active) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest("[data-dev-ui]")) return;
      event.preventDefault();
      event.stopPropagation();
      const selector = computeSelector(target);
      if (selector) setSelected(selector);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [active]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/ui-style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styles: stylesRef.current }),
      });
    }, 700);
  }, []);

  const patch = useCallback(
    (selector: string, change: Partial<UiElementStyle>) => {
      setStyles((prev) => {
        const merged: UiElementStyle = { ...(prev[selector] ?? {}), ...change };
        (Object.keys(merged) as (keyof UiElementStyle)[]).forEach((k) => {
          if (merged[k] == null) delete merged[k];
        });
        const next = { ...prev };
        if (Object.keys(merged).length === 0) delete next[selector];
        else next[selector] = merged;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const resetSelector = useCallback(
    (selector: string) => {
      setStyles((prev) => {
        const next = { ...prev };
        delete next[selector];
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const css = generateUiCss(styles);

  // Always render the override stylesheet (applies for everyone).
  const styleTag = (
    <style>{css + (active ? HOVER_CSS : "")}</style>
  );

  if (!canEdit) return styleTag;

  const current: UiElementStyle = (selected && styles[selected]) || {};

  const colorControl = (
    label: string,
    prop: "textColor" | "backgroundColor" | "borderColor",
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#475569", minWidth: 74 }}>{label}</span>
      <input
        type="color"
        value={current[prop] ?? "#000000"}
        onChange={(e) =>
          selected && patch(selected, { [prop]: e.target.value })
        }
        style={{ width: 28, height: 22, padding: 0, border: "none" }}
      />
      {current[prop] ? (
        <button
          type="button"
          onClick={() => selected && patch(selected, { [prop]: undefined })}
          style={{ color: "#94a3b8", background: "none", border: "none" }}
          aria-label={`Clear ${label}`}
        >
          ✕
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {styleTag}

      <button
        type="button"
        data-dev-ui="1"
        onClick={() => {
          setActive((on) => !on);
          if (active) setSelected(null);
        }}
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 2147483000,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid #334155",
          background: active ? "#4f46e5" : "#0f172a",
          color: "#fff",
          fontSize: 12,
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      >
        {active ? "Design: ON" : "Design"}
      </button>

      {active ? (
        <div
          data-dev-ui="1"
          style={{
            position: "fixed",
            bottom: 56,
            left: 16,
            zIndex: 2147483000,
            width: 280,
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            padding: 12,
            fontSize: 12,
            color: "#0f172a",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Design mode</div>
          {!selected ? (
            <div style={{ color: "#64748b" }}>
              Click any element on the page to style it.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  color: "#64748b",
                  wordBreak: "break-all",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
                title={selected}
              >
                {selected}
              </div>

              {colorControl("Text", "textColor")}
              {colorControl("Background", "backgroundColor")}
              {colorControl("Border", "borderColor")}

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#475569", minWidth: 74 }}>Font size</span>
                <input
                  type="number"
                  min={8}
                  max={96}
                  value={current.fontSize ?? ""}
                  onChange={(e) =>
                    patch(selected, {
                      fontSize: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  style={{ width: 60, padding: "2px 4px", border: "1px solid #cbd5e1", borderRadius: 4 }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#475569", minWidth: 74 }}>Weight</span>
                <select
                  value={current.fontWeight ? String(current.fontWeight) : ""}
                  onChange={(e) =>
                    patch(selected, {
                      fontWeight: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  style={{ padding: "2px 4px", border: "1px solid #cbd5e1", borderRadius: 4 }}
                >
                  <option value="">Default</option>
                  <option value="400">Regular</option>
                  <option value="500">Medium</option>
                  <option value="600">Semibold</option>
                  <option value="700">Bold</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#475569", minWidth: 74 }}>Padding</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={current.padding ?? ""}
                  onChange={(e) =>
                    patch(selected, {
                      padding: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  style={{ width: 60, padding: "2px 4px", border: "1px solid #cbd5e1", borderRadius: 4 }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  type="button"
                  onClick={() => resetSelector(selected)}
                  style={{ color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                >
                  Reset element
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{ color: "#64748b", background: "none", border: "none", cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
