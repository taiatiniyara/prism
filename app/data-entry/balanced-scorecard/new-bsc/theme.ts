import type { BscElementStyle, BscThemeStyles } from "@/db/schema/bsc-builder";

export type { BscElementStyle, BscThemeStyles };

/**
 * The set of BSC elements a DEV can restyle. Each id is wired to one or more
 * elements via a `data-bsc-el="<id>"` attribute in the BSC components. Styling
 * is applied per element TYPE (a theme), never per individual node.
 */
export const STYLEABLE_ELEMENTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "container", label: "Panel background" },
  { id: "perspectiveCard", label: "Perspective card" },
  { id: "perspectiveTitle", label: "Perspective title" },
  { id: "nodeRow", label: "Tree row" },
  { id: "objectiveBlock", label: "Specific objective block" },
  { id: "initiativeCard", label: "Initiative / Project card" },
  { id: "kpiRow", label: "KPI row" },
  { id: "badge", label: "Badges" },
];

const STYLEABLE_IDS = new Set(STYLEABLE_ELEMENTS.map((element) => element.id));

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_WEIGHTS = new Set([400, 500, 600, 700]);

const safeColor = (value: unknown): string | null =>
  typeof value === "string" && HEX.test(value.trim()) ? value.trim() : null;

const safeInt = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

const safeWeight = (value: unknown): number | null => {
  const n = Number(value);
  return FONT_WEIGHTS.has(n) ? n : null;
};

/** Drop unknown keys and invalid values so only safe styles are ever stored. */
export const sanitizeThemeStyles = (input: unknown): BscThemeStyles => {
  if (input == null || typeof input !== "object") return {};
  const out: BscThemeStyles = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!STYLEABLE_IDS.has(key) || raw == null || typeof raw !== "object") {
      continue;
    }
    const value = raw as Record<string, unknown>;
    const style: BscElementStyle = {};
    const textColor = safeColor(value.textColor);
    const backgroundColor = safeColor(value.backgroundColor);
    const borderColor = safeColor(value.borderColor);
    const fontSize = safeInt(value.fontSize, 8, 48);
    const fontWeight = safeWeight(value.fontWeight);
    const padding = safeInt(value.padding, 0, 40);
    if (textColor) style.textColor = textColor;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    if (borderColor) style.borderColor = borderColor;
    if (fontSize != null) style.fontSize = fontSize;
    if (fontWeight != null) style.fontWeight = fontWeight;
    if (padding != null) style.padding = padding;
    if (Object.keys(style).length > 0) out[key] = style;
  }
  return out;
};

/**
 * Generate a scoped stylesheet from a (sanitized) theme. Only whitelisted
 * properties with validated values are emitted, so the output is injection-safe.
 */
export const generateThemeCss = (
  styles: BscThemeStyles,
  scopeClass = "bsc-themed",
): string => {
  const safe = sanitizeThemeStyles(styles);
  const rules: string[] = [];
  for (const { id } of STYLEABLE_ELEMENTS) {
    const style = safe[id];
    if (!style) continue;
    const decls: string[] = [];
    if (style.textColor) decls.push(`color:${style.textColor}`);
    if (style.backgroundColor) {
      decls.push(`background-color:${style.backgroundColor}`);
    }
    if (style.borderColor) {
      decls.push(
        `border-color:${style.borderColor}`,
        "border-width:1px",
        "border-style:solid",
      );
    }
    if (style.fontSize != null) decls.push(`font-size:${style.fontSize}px`);
    if (style.fontWeight != null) decls.push(`font-weight:${style.fontWeight}`);
    if (style.padding != null) decls.push(`padding:${style.padding}px`);
    if (decls.length > 0) {
      rules.push(`.${scopeClass} [data-bsc-el="${id}"]{${decls.join(";")}}`);
    }
  }
  return rules.join("\n");
};
