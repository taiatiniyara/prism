"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import {
  resolveLabel,
  setFieldOverride,
  type FormOverrideMap,
} from "@/lib/form-overrides";

interface FormOverridesContextValue {
  getLabel: (formId: string, fieldKey: string, fallback: string) => string;
}

const FormOverridesContext = createContext<FormOverridesContextValue>({
  getLabel: (_formId, _fieldKey, fallback) => fallback,
});

// Consumed by DataTable forms + column headers.
export const useFormOverrides = () => useContext(FormOverridesContext);

// formId = the settings route path (stable, one DataTable per page in practice).
export const useFormId = (): string => usePathname() || "/";

// Hover outline only while the label editor is on; ignore the editor's own panel.
const EDIT_CSS = `
body[data-form-edit="on"] [data-form-field-key]{outline:1px dashed #f59e0b !important;outline-offset:2px;cursor:text !important;}
body[data-form-edit="on"] [data-form-overrides-ui] [data-form-field-key]{outline:none !important;cursor:auto !important;}
`;

interface Selected {
  formId: string;
  fieldKey: string;
  fallback: string;
}

export default function FormOverridesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<FormOverrideMap>({});
  const [canEdit, setCanEdit] = useState(false);
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [draft, setDraft] = useState("");
  const overridesRef = useRef<FormOverrideMap>({});
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/form-overrides", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { overrides?: FormOverrideMap; canEdit?: boolean }) => {
        if (cancelled) return;
        setOverrides(data.overrides ?? {});
        setCanEdit(Boolean(data.canEdit));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-form-edit", active ? "on" : "off");
  }, [active]);

  const getLabel = useCallback(
    (formId: string, fieldKey: string, fallback: string) =>
      resolveLabel(overrides, formId, fieldKey, fallback),
    [overrides],
  );

  const persist = useCallback((next: FormOverrideMap) => {
    setOverrides(next);
    void fetch("/api/form-overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: next }),
    }).catch(() => {});
  }, []);

  // Capture clicks on labelled elements while editing.
  useEffect(() => {
    if (!active) return;
    const handler = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-form-overrides-ui]")) return; // our own panel
      const el = target.closest<HTMLElement>("[data-form-field-key]");
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      const formId = el.getAttribute("data-form-id") || "/";
      const fieldKey = el.getAttribute("data-form-field-key") || "";
      const fallback = (el.getAttribute("data-form-default-label") || el.textContent || "").trim();
      setSelected({ formId, fieldKey, fallback });
      setDraft(resolveLabel(overridesRef.current, formId, fieldKey, fallback));
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [active]);

  const saveSelected = () => {
    if (!selected) return;
    const value = draft.trim();
    // Empty or equal-to-default clears the override.
    const patch =
      value === "" || value === selected.fallback
        ? { label: undefined }
        : { label: value };
    persist(
      setFieldOverride(overridesRef.current, selected.formId, selected.fieldKey, patch),
    );
    setSelected(null);
  };

  const resetSelected = () => {
    if (!selected) return;
    persist(
      setFieldOverride(overridesRef.current, selected.formId, selected.fieldKey, {
        label: undefined,
      }),
    );
    setSelected(null);
  };

  const value = useMemo<FormOverridesContextValue>(() => ({ getLabel }), [getLabel]);

  return (
    <FormOverridesContext.Provider value={value}>
      {children}
      {canEdit && (
        <div data-form-overrides-ui>
          <style>{EDIT_CSS}</style>
          <button
            type="button"
            onClick={() => {
              setActive((on) => !on);
              setSelected(null);
            }}
            style={{
              position: "fixed",
              right: 16,
              bottom: 96,
              zIndex: 2147483000,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #334155",
              background: active ? "#f59e0b" : "#0f172a",
              color: active ? "#0f172a" : "#f8fafc",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 6px 20px -8px rgba(0,0,0,.5)",
              cursor: "pointer",
            }}
          >
            {active ? "✓ Editing labels" : "✎ Edit labels"}
          </button>

          {active && selected && (
            <div
              style={{
                position: "fixed",
                right: 16,
                bottom: 148,
                zIndex: 2147483000,
                width: 300,
                padding: 14,
                borderRadius: 12,
                border: "1px solid #334155",
                background: "#fff",
                boxShadow: "0 12px 40px -12px rgba(0,0,0,.4)",
              }}
            >
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                {selected.formId} · <code>{selected.fieldKey}</code>
              </div>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveSelected();
                  if (e.key === "Escape") setSelected(null);
                }}
                placeholder={selected.fallback}
                style={{
                  width: "100%",
                  height: 36,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={resetSelected}
                  style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}
                >
                  Reset to default
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSelected}
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid #4338ca", background: "#4338ca", color: "#fff", cursor: "pointer" }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </FormOverridesContext.Provider>
  );
}
