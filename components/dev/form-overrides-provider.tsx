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

// Outline labels while editing; the element being edited gets a solid amber ring.
// Editing happens IN PLACE (contentEditable), so it works inside modals/sheets too.
const EDIT_CSS = `
body[data-form-edit="on"] [data-form-field-key]{outline:1px dashed #f59e0b !important;outline-offset:2px;cursor:text !important;}
body[data-form-edit="on"] [data-form-field-key][contenteditable="true"]{outline:2px solid #f59e0b !important;background:#fffbeb !important;border-radius:3px;}
body[data-form-edit="on"] [data-form-overrides-ui] [data-form-field-key]{outline:none !important;cursor:auto !important;}
`;

interface Editing {
  el: HTMLElement;
  formId: string;
  fieldKey: string;
  fallback: string;
  original: string;
}

export default function FormOverridesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<FormOverrideMap>({});
  const [canEdit, setCanEdit] = useState(false);
  const [active, setActive] = useState(false);
  const overridesRef = useRef<FormOverrideMap>({});
  const editingRef = useRef<Editing | null>(null);

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

  // Finish the in-place edit: save the new text (or revert on cancel).
  const commitEdit = useCallback(
    (save: boolean) => {
      const ed = editingRef.current;
      if (!ed) return;
      editingRef.current = null;
      ed.el.removeAttribute("contenteditable");
      ed.el.onkeydown = null;
      ed.el.onblur = null;
      if (save) {
        const text = (ed.el.textContent || "").trim();
        const patch =
          text === "" || text === ed.fallback
            ? { label: undefined }
            : { label: text };
        // React re-renders the label from the new override; keep the DOM in sync
        // meanwhile so there's no flicker.
        ed.el.textContent = patch.label ?? ed.fallback;
        persist(
          setFieldOverride(overridesRef.current, ed.formId, ed.fieldKey, patch),
        );
      } else {
        ed.el.textContent = ed.original;
      }
    },
    [persist],
  );

  const toggleActive = useCallback(() => {
    if (editingRef.current) commitEdit(true);
    setActive((a) => !a);
  }, [commitEdit]);

  // Alt+E toggles edit mode — works even while a modal/sheet is open (a click on
  // the floating button would count as an outside-interaction and close a modal).
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        toggleActive();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canEdit, toggleActive]);

  // Click a labelled element (while editing) → edit it in place.
  useEffect(() => {
    if (!active) return;
    const handler = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-form-overrides-ui]")) return; // our own toggle
      const el = target.closest<HTMLElement>("[data-form-field-key]");
      if (!el) return;
      if (editingRef.current?.el === el) return; // already editing this one
      ev.preventDefault();
      ev.stopPropagation();
      if (editingRef.current) commitEdit(true); // commit a previous edit
      const formId = el.getAttribute("data-form-id") || "/";
      const fieldKey = el.getAttribute("data-form-field-key") || "";
      const fallback = (el.getAttribute("data-form-default-label") || "").trim();
      editingRef.current = {
        el,
        formId,
        fieldKey,
        fallback,
        original: el.textContent || "",
      };
      el.setAttribute("contenteditable", "true");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.onkeydown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          commitEdit(false);
        }
      };
      el.onblur = () => commitEdit(true);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [active, commitEdit]);

  const value = useMemo<FormOverridesContextValue>(
    () => ({ getLabel }),
    [getLabel],
  );

  return (
    <FormOverridesContext.Provider value={value}>
      {children}
      {canEdit && (
        // pointer-events:auto keeps the toggle clickable even when a radix modal
        // sets `pointer-events:none` on the background.
        <div data-form-overrides-ui style={{ pointerEvents: "auto" }}>
          <style>{EDIT_CSS}</style>
          <button
            type="button"
            title="Toggle label editing (Alt+E)"
            onClick={toggleActive}
            style={{
              position: "fixed",
              right: 16,
              bottom: 96,
              zIndex: 2147483000,
              pointerEvents: "auto",
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
            {active ? "✓ Editing labels · Alt+E" : "✎ Edit labels · Alt+E"}
          </button>
        </div>
      )}
    </FormOverridesContext.Provider>
  );
}
