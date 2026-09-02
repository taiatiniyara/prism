"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import {
  orderKeys,
  resolveHidden,
  resolveLabel,
  resolveWidth,
  setFieldOrder,
  setFieldOverride,
  type FormOverrideMap,
} from "@/lib/form-overrides";
import {
  generateUiCss,
  isSafeSelector,
  type UiElementStyle,
  type UiStyleMap,
} from "@/lib/ui-style";
import DesignStylePanel from "./design-style-panel";

// Build a reasonably-stable CSS selector for a clicked element (for styling).
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
      const current: Element = node;
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === current.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
    depth += 1;
  }
  return parts.join(" > ");
};

interface FormOverridesContextValue {
  getLabel: (formId: string, fieldKey: string, fallback: string) => string;
  orderedKeys: (formId: string, keys: string[]) => string[];
  reorder: (formId: string, orderedKeys: string[]) => void;
  reorderActive: boolean;
  widthActive: boolean;
  getWidth: (formId: string, fieldKey: string) => "full" | "half";
  toggleFieldWidth: (formId: string, fieldKey: string) => void;
  canEdit: boolean;
  getHidden: (formId: string, fieldKey: string, defaultHidden?: boolean) => boolean;
  toggleHidden: (
    formId: string,
    fieldKey: string,
    defaultHidden?: boolean,
  ) => void;
}

const FormOverridesContext = createContext<FormOverridesContextValue>({
  getLabel: (_formId, _fieldKey, fallback) => fallback,
  orderedKeys: (_formId, keys) => keys,
  reorder: () => {},
  reorderActive: false,
  widthActive: false,
  getWidth: () => "full",
  toggleFieldWidth: () => {},
  canEdit: false,
  getHidden: () => false,
  toggleHidden: () => {},
});

// Consumed by DataTable forms + column headers.
export const useFormOverrides = () => useContext(FormOverridesContext);

// Drag-to-reorder helper for a list of keyed items (form fields, columns). While
// reorder mode is on it returns spreadable drag handlers per key; otherwise it's
// inert and just returns the items in their DEV-ordered sequence.
export function useReorderableList<T>(
  formId: string,
  items: T[],
  keyOf: (item: T) => string,
): {
  ordered: T[];
  dragProps: (key: string) => HTMLAttributes<HTMLElement> & { draggable?: boolean };
} {
  const { orderedKeys, reorder, reorderActive } = useFormOverrides();
  const [overKey, setOverKey] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);

  const order = orderedKeys(formId, items.map(keyOf));
  const byKey = new Map(items.map((it) => [keyOf(it), it]));
  const ordered = order
    .map((k) => byKey.get(k))
    .filter((it): it is T => it !== undefined);

  const dragProps = (key: string) => {
    if (!reorderActive) return {};
    return {
      draggable: true,
      style:
        overKey === key
          ? { outline: "2px solid #6366f1", background: "#eef2ff" }
          : undefined,
      onDragStart: (e: DragEvent) => {
        dragKey.current = key;
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: DragEvent) => {
        if (!dragKey.current) return;
        e.preventDefault();
        if (overKey !== key) setOverKey(key);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const from = dragKey.current;
        dragKey.current = null;
        setOverKey(null);
        if (!from || from === key) return;
        const next = order.slice();
        const fromIdx = next.indexOf(from);
        if (fromIdx === -1) return;
        next.splice(fromIdx, 1);
        next.splice(next.indexOf(key), 0, from);
        reorder(formId, next);
      },
      onDragEnd: () => {
        dragKey.current = null;
        setOverKey(null);
      },
    };
  };

  return { ordered, dragProps };
}

// Full/half width helper for form fields. `spanClass(key)` is the grid span for
// a field; `widthProps(key)` (only in width mode) makes the field toggle its
// width on click. The form container must be a 2-col grid on sm+.
export function useFieldWidth(formId: string): {
  spanClass: (key: string) => string;
  widthProps: (key: string) => HTMLAttributes<HTMLElement>;
} {
  const { widthActive, getWidth, toggleFieldWidth } = useFormOverrides();

  const spanClass = (key: string) =>
    getWidth(formId, key) === "half" ? "sm:col-span-1" : "sm:col-span-2";

  const widthProps = (key: string): HTMLAttributes<HTMLElement> =>
    widthActive
      ? {
          // Capture the click before it reaches the field's input, and toggle.
          onClickCapture: (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFieldWidth(formId, key);
          },
          title: "Click to toggle full / half width",
        }
      : {};

  return { spanClass, widthProps };
}

// formId = the settings route path (stable, one DataTable per page in practice).
export const useFormId = (): string => usePathname() || "/";

// Outline labels while editing; the element being edited gets a solid amber ring.
// Editing happens IN PLACE (contentEditable), so it works inside modals/sheets too.
const EDIT_CSS = `
body[data-form-edit="on"] *:hover{outline:1px dashed #6366f1 !important;outline-offset:-1px;cursor:crosshair !important;}
body[data-form-edit="on"] [data-form-field-key]{outline:1px dashed #f59e0b !important;outline-offset:2px;}
body[data-form-edit="on"] [data-form-field-key]:hover{outline:2px solid #f59e0b !important;cursor:text !important;}
body[data-form-edit="on"] [data-form-field-key][contenteditable="true"]{outline:2px solid #f59e0b !important;background:#fffbeb !important;border-radius:3px;}
body[data-form-edit="on"] [data-form-overrides-ui] *:hover,body[data-form-edit="on"] [data-form-overrides-ui]:hover{outline:none !important;cursor:auto !important;}
body[data-form-edit="on"] [data-form-overrides-ui] [data-form-field-key]{outline:none !important;}
body[data-form-reorder="on"] [draggable="true"]{cursor:grab !important;outline:1px dashed #6366f1 !important;outline-offset:3px;border-radius:4px;}
body[data-form-reorder="on"] [draggable="true"]:active{cursor:grabbing !important;}
body[data-form-reorder="on"] [data-form-overrides-ui] [draggable="true"]{outline:none !important;cursor:pointer !important;}
body[data-form-width="on"] [data-field-wrapper]{outline:1px dashed #10b981 !important;outline-offset:3px;border-radius:4px;cursor:pointer !important;}
body[data-form-width="on"] [data-field-wrapper] *{cursor:pointer !important;}
`;

interface Editing {
  el: HTMLElement;
  formId: string;
  fieldKey: string;
  fallback: string;
  original: string;
}

// Shared style for the two floating DEV toggles (amber = labels, indigo = reorder).
const toggleStyle = (on: boolean, onColor: string): CSSProperties => ({
  pointerEvents: "auto",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #334155",
  background: on ? onColor : "#0f172a",
  color: on ? "#0f172a" : "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 6px 20px -8px rgba(0,0,0,.5)",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export default function FormOverridesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<FormOverrideMap>({});
  const [canEdit, setCanEdit] = useState(false);
  const [active, setActive] = useState(false); // label-edit mode
  const [reorderActive, setReorderActive] = useState(false); // drag-reorder mode
  const [widthActive, setWidthActive] = useState(false); // field-width mode
  // Draggable position of the DEV toolbar (per-viewer, localStorage). null = the
  // default bottom-right anchor. The toolbar only renders once canEdit is true
  // (post-fetch, client-side), so this initializer never causes a hydration diff.
  const [uiPos, setUiPos] = useState<{ top: number; left: number } | null>(
    () => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem("prism-dev-tools-pos");
        return raw ? (JSON.parse(raw) as { top: number; left: number }) : null;
      } catch {
        return null;
      }
    },
  );
  const overridesRef = useRef<FormOverrideMap>({});
  const editingRef = useRef<Editing | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    startTop: number;
    startLeft: number;
    latest: { top: number; left: number };
  } | null>(null);
  // Unified Design mode also styles arbitrary elements (folded in from the old
  // standalone Design tool): selector -> UiElementStyle, persisted via /api/ui-style.
  const [styles, setStyles] = useState<UiStyleMap>({});
  const [selectedSelector, setSelectedSelector] = useState<string | null>(null);
  const stylesRef = useRef<UiStyleMap>({});
  const styleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    stylesRef.current = styles;
  }, [styles]);

  // Load the element-style overrides (applied for everyone; DEV edits them).
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ui-style", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { styles?: UiStyleMap }) => {
        if (!cancelled) setStyles(data.styles ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    document.body.setAttribute("data-form-reorder", reorderActive ? "on" : "off");
  }, [reorderActive]);

  useEffect(() => {
    document.body.setAttribute("data-form-width", widthActive ? "on" : "off");
  }, [widthActive]);

  const getLabel = useCallback(
    (formId: string, fieldKey: string, fallback: string) =>
      resolveLabel(overrides, formId, fieldKey, fallback),
    [overrides],
  );

  const orderedKeys = useCallback(
    (formId: string, keys: string[]) => orderKeys(overrides, formId, keys),
    [overrides],
  );

  const getWidth = useCallback(
    (formId: string, fieldKey: string) =>
      resolveWidth(overrides, formId, fieldKey),
    [overrides],
  );

  const getHidden = useCallback(
    (formId: string, fieldKey: string, defaultHidden = false) =>
      resolveHidden(overrides, formId, fieldKey, defaultHidden),
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

  const reorder = useCallback(
    (formId: string, keys: string[]) =>
      persist(setFieldOrder(overridesRef.current, formId, keys)),
    [persist],
  );

  const scheduleStyleSave = useCallback(() => {
    if (styleSaveTimer.current) clearTimeout(styleSaveTimer.current);
    styleSaveTimer.current = setTimeout(() => {
      void fetch("/api/ui-style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styles: stylesRef.current }),
      }).catch(() => {});
    }, 600);
  }, []);

  const patchStyle = useCallback(
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
      scheduleStyleSave();
    },
    [scheduleStyleSave],
  );

  const resetSelector = useCallback(
    (selector: string) => {
      setStyles((prev) => {
        const next = { ...prev };
        delete next[selector];
        return next;
      });
      scheduleStyleSave();
    },
    [scheduleStyleSave],
  );

  const toggleFieldWidth = useCallback(
    (formId: string, fieldKey: string) => {
      const next =
        resolveWidth(overridesRef.current, formId, fieldKey) === "half"
          ? undefined
          : ("half" as const);
      persist(
        setFieldOverride(overridesRef.current, formId, fieldKey, {
          width: next,
        }),
      );
    },
    [persist],
  );

  const toggleHidden = useCallback(
    (formId: string, fieldKey: string, defaultHidden = false) => {
      const nextHidden = !resolveHidden(
        overridesRef.current,
        formId,
        fieldKey,
        defaultHidden,
      );
      // Prune back to `undefined` when the new state matches the column default.
      const patch = nextHidden === defaultHidden ? undefined : nextHidden;
      persist(
        setFieldOverride(overridesRef.current, formId, fieldKey, {
          hidden: patch,
        }),
      );
    },
    [persist],
  );

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

  // The three modes are mutually exclusive so their affordances never overlap.
  const toggleActive = useCallback(() => {
    if (editingRef.current) commitEdit(true);
    setReorderActive(false);
    setWidthActive(false);
    setSelectedSelector(null);
    setActive((a) => !a);
  }, [commitEdit]);

  const toggleReorder = useCallback(() => {
    if (editingRef.current) commitEdit(true);
    setActive(false);
    setWidthActive(false);
    setSelectedSelector(null);
    setReorderActive((r) => !r);
  }, [commitEdit]);

  const toggleWidth = useCallback(() => {
    if (editingRef.current) commitEdit(true);
    setActive(false);
    setReorderActive(false);
    setSelectedSelector(null);
    setWidthActive((w) => !w);
  }, [commitEdit]);

  // Drag the toolbar via pointer capture (no window listeners; the handle keeps
  // receiving move/up even when the pointer leaves it).
  const onDragStart = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget.parentElement as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTop: rect.top,
      startLeft: rect.left,
      latest: { top: rect.top, left: rect.left },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = dragState.current;
    if (!d) return;
    const top = Math.min(
      Math.max(0, d.startTop + (e.clientY - d.startY)),
      window.innerHeight - 44,
    );
    const left = Math.min(
      Math.max(0, d.startLeft + (e.clientX - d.startX)),
      window.innerWidth - 60,
    );
    d.latest = { top, left };
    setUiPos({ top, left });
  }, []);

  const onDragEnd = useCallback(() => {
    const latest = dragState.current?.latest;
    dragState.current = null;
    if (latest) {
      try {
        localStorage.setItem("prism-dev-tools-pos", JSON.stringify(latest));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Alt+E (labels) / Alt+R (reorder) / Alt+W (width) — work even while a modal is
  // open (a click on a floating button counts as an outside-interaction and would
  // close a modal; the buttons themselves are also made modal-safe below).
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        toggleActive();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        toggleReorder();
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        toggleWidth();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canEdit, toggleActive, toggleReorder, toggleWidth]);

  // Design mode: click a label -> edit its text in place; click any other
  // element -> select it for styling.
  useEffect(() => {
    if (!active) return;
    const handler = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-form-overrides-ui]")) return; // our own toolbar
      const el = target.closest<HTMLElement>("[data-form-field-key]");
      if (!el) {
        // Not a label → style this element.
        ev.preventDefault();
        ev.stopPropagation();
        if (editingRef.current) commitEdit(true);
        const selector = computeSelector(target);
        if (isSafeSelector(selector)) setSelectedSelector(selector);
        return;
      }
      if (editingRef.current?.el === el) return; // already editing this one
      ev.preventDefault();
      ev.stopPropagation();
      if (editingRef.current) commitEdit(true); // commit a previous edit
      setSelectedSelector(null); // switch from styling to label editing
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
    () => ({
      getLabel,
      orderedKeys,
      reorder,
      reorderActive,
      widthActive,
      getWidth,
      toggleFieldWidth,
      canEdit,
      getHidden,
      toggleHidden,
    }),
    [
      getLabel,
      orderedKeys,
      reorder,
      reorderActive,
      widthActive,
      getWidth,
      toggleFieldWidth,
      canEdit,
      getHidden,
      toggleHidden,
    ],
  );

  return (
    <FormOverridesContext.Provider value={value}>
      {/* Element-style overrides apply for everyone (DEV edits them). */}
      <style>{generateUiCss(styles)}</style>
      {children}
      {canEdit && selectedSelector && active && (
        <DesignStylePanel
          selector={selectedSelector}
          style={styles[selectedSelector] ?? {}}
          onPatch={(change) => patchStyle(selectedSelector, change)}
          onReset={() => {
            resetSelector(selectedSelector);
            setSelectedSelector(null);
          }}
          onClose={() => setSelectedSelector(null)}
        />
      )}
      {canEdit && (
        // pointer-events:auto keeps the toggles clickable even when a radix modal
        // sets `pointer-events:none` on the background.
        <div
          data-form-overrides-ui
          style={{
            position: "fixed",
            ...(uiPos
              ? { top: uiPos.top, left: uiPos.left }
              : { right: 16, bottom: 96 }),
            zIndex: 2147483000,
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 6,
          }}
        >
          <style>{EDIT_CSS}</style>
          {/* Drag handle — move the whole DEV toolbar anywhere; position persists. */}
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            title="Drag to move the DEV tools"
            style={{
              cursor: "move",
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#94a3b8",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.03em",
              boxShadow: "0 6px 20px -8px rgba(0,0,0,.5)",
            }}
          >
            ⠿ DEV TOOLS
          </div>
          <button
            type="button"
            title="Toggle field width — click a field to switch full/half (Alt+W)"
            onClick={toggleWidth}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
            style={toggleStyle(widthActive, "#10b981")}
          >
            {widthActive ? "✓ Set width · Alt+W" : "⇱ Field width · Alt+W"}
          </button>
          <button
            type="button"
            title="Toggle field reordering (Alt+R)"
            onClick={toggleReorder}
            // Keep an open radix modal from dismissing when a button is used: stop
            // the pointerdown reaching radix's outside-detection, and prevent the
            // button taking focus (focus leaving the modal also dismisses it).
            // Neither stops the button's own click, so the toggle still fires.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
            style={toggleStyle(reorderActive, "#6366f1")}
          >
            {reorderActive ? "✓ Reordering · Alt+R" : "⇅ Reorder fields · Alt+R"}
          </button>
          <button
            type="button"
            title="Design mode (Alt+E) — click a label to rename it, any other element to style it"
            onClick={toggleActive}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
            style={toggleStyle(active, "#f59e0b")}
          >
            {active ? "✓ Design · Alt+E" : "✎ Design · Alt+E"}
          </button>
        </div>
      )}
    </FormOverridesContext.Provider>
  );
}
