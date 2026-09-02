"use client";

import type { UiElementStyle } from "@/lib/ui-style";

// Element-styling controls for the unified Design mode. Rendered inside the DEV
// toolbar's [data-form-overrides-ui] scope so it never dismisses a sheet or gets
// styled/selected itself.
export default function DesignStylePanel({
  selector,
  style,
  onPatch,
  onReset,
  onClose,
}: {
  selector: string;
  style: UiElementStyle;
  onPatch: (change: Partial<UiElementStyle>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const colorControl = (
    label: string,
    prop: "textColor" | "backgroundColor" | "borderColor",
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#475569", minWidth: 74 }}>{label}</span>
      <input
        type="color"
        value={style[prop] ?? "#000000"}
        onChange={(e) => onPatch({ [prop]: e.target.value })}
        style={{ width: 28, height: 22, padding: 0, border: "none" }}
      />
      {style[prop] ? (
        <button
          type="button"
          onClick={() => onPatch({ [prop]: undefined })}
          style={{ color: "#94a3b8", background: "none", border: "none" }}
          aria-label={`Clear ${label}`}
        >
          ✕
        </button>
      ) : null}
    </div>
  );

  const numberControl = (
    label: string,
    prop: "fontSize" | "padding",
    min: number,
    max: number,
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#475569", minWidth: 74 }}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={style[prop] ?? ""}
        onChange={(e) =>
          onPatch({ [prop]: e.target.value ? Number(e.target.value) : undefined })
        }
        style={{
          width: 60,
          padding: "2px 4px",
          border: "1px solid #cbd5e1",
          borderRadius: 4,
        }}
      />
    </div>
  );

  return (
    <div
      data-form-overrides-ui
      style={{
        position: "fixed",
        bottom: 16,
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
        pointerEvents: "auto",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Style element</div>
      <div
        style={{
          color: "#64748b",
          wordBreak: "break-all",
          fontFamily: "monospace",
          fontSize: 11,
          marginBottom: 8,
        }}
        title={selector}
      >
        {selector}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {colorControl("Text", "textColor")}
        {colorControl("Background", "backgroundColor")}
        {colorControl("Border", "borderColor")}
        {numberControl("Font size", "fontSize", 8, 96)}

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#475569", minWidth: 74 }}>Weight</span>
          <select
            value={style.fontWeight ? String(style.fontWeight) : ""}
            onChange={(e) =>
              onPatch({
                fontWeight: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            style={{
              padding: "2px 4px",
              border: "1px solid #cbd5e1",
              borderRadius: 4,
            }}
          >
            <option value="">Default</option>
            <option value="400">Regular</option>
            <option value="500">Medium</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
          </select>
        </div>

        {numberControl("Padding", "padding", 0, 80)}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={onReset}
            style={{
              color: "#dc2626",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reset element
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              color: "#64748b",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
