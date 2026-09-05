// DEV-editable design tokens — the brand/status/chart palette that normally lives
// in app/globals.css. A DEV can override any of these from Settings → Design; the
// override is stored globally and injected as a late :root stylesheet that wins
// over the CSS defaults, so the whole app re-skins with no code change.

export interface DesignTokenDef {
  key: string;
  label: string;
  cssVar: string; // the CSS custom property it overrides
  fallback: string; // hex approximation of the built-in default (seeds the picker)
  group: "Brand & status" | "Neutral" | "Charts";
}

export const DESIGN_TOKENS: DesignTokenDef[] = [
  { key: "brand", label: "Brand accent", cssVar: "--brand", fallback: "#f59e0b", group: "Brand & status" },
  { key: "success", label: "Success", cssVar: "--success", fallback: "#16a34a", group: "Brand & status" },
  { key: "warning", label: "Warning", cssVar: "--warning", fallback: "#d97706", group: "Brand & status" },
  { key: "danger", label: "Danger", cssVar: "--danger", fallback: "#dc2626", group: "Brand & status" },
  { key: "info", label: "Info", cssVar: "--info", fallback: "#0284c7", group: "Brand & status" },
  { key: "background", label: "App background", cssVar: "--background", fallback: "#fbfcfd", group: "Neutral" },
  { key: "chart1", label: "Chart 1", cssVar: "--chart-1", fallback: "#f59e0b", group: "Charts" },
  { key: "chart2", label: "Chart 2", cssVar: "--chart-2", fallback: "#14b8a6", group: "Charts" },
  { key: "chart3", label: "Chart 3", cssVar: "--chart-3", fallback: "#6366f1", group: "Charts" },
  { key: "chart4", label: "Chart 4", cssVar: "--chart-4", fallback: "#f43f5e", group: "Charts" },
  { key: "chart5", label: "Chart 5", cssVar: "--chart-5", fallback: "#84cc16", group: "Charts" },
];

const TOKEN_BY_KEY = new Map(DESIGN_TOKENS.map((t) => [t.key, t]));

// key -> hex value (only overridden tokens are stored).
export type DesignTokenMap = Record<string, string>;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const sanitizeDesignTokens = (input: unknown): DesignTokenMap => {
  if (!input || typeof input !== "object") return {};
  const out: DesignTokenMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!TOKEN_BY_KEY.has(key)) continue;
    if (typeof value === "string" && HEX_RE.test(value.trim())) {
      out[key] = value.trim().toLowerCase();
    }
  }
  return out;
};

// Build the override stylesheet. Injected late (after globals.css) so these win.
// Only overridden tokens are emitted; the rest keep their built-in oklch values.
export const generateTokenCss = (map: DesignTokenMap): string => {
  const safe = sanitizeDesignTokens(map);
  const decls = Object.entries(safe)
    .map(([key, hex]) => {
      const def = TOKEN_BY_KEY.get(key);
      return def ? `${def.cssVar}:${hex};` : "";
    })
    .filter(Boolean)
    .join("");
  return decls ? `:root{${decls}}` : "";
};
