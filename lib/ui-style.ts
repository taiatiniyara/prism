import type { UiElementStyle, UiStyleMap } from "@/db/schema/ui-style";

export type { UiElementStyle, UiStyleMap };

// Curated styleable property set (no raw CSS — injection-safe).
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_WEIGHTS = new Set([400, 500, 600, 700]);

// Only allow selectors built from tags, ids, classes, child combinators,
// :nth-of-type(n) and whitespace. Anything that could break out of a selector
// (braces, semicolons, @, comments, etc.) is rejected.
const SELECTOR_RE = /^[a-zA-Z0-9 .#:_()>-]{1,400}$/;

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

export const isSafeSelector = (selector: string): boolean =>
  SELECTOR_RE.test(selector) &&
  !selector.includes("{") &&
  !selector.includes("}");

const sanitizeStyle = (raw: unknown): UiElementStyle | null => {
  if (raw == null || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const style: UiElementStyle = {};
  const textColor = safeColor(value.textColor);
  const backgroundColor = safeColor(value.backgroundColor);
  const borderColor = safeColor(value.borderColor);
  const fontSize = safeInt(value.fontSize, 8, 96);
  const fontWeight = safeWeight(value.fontWeight);
  const padding = safeInt(value.padding, 0, 80);
  if (textColor) style.textColor = textColor;
  if (backgroundColor) style.backgroundColor = backgroundColor;
  if (borderColor) style.borderColor = borderColor;
  if (fontSize != null) style.fontSize = fontSize;
  if (fontWeight != null) style.fontWeight = fontWeight;
  if (padding != null) style.padding = padding;
  return Object.keys(style).length > 0 ? style : null;
};

/** Drop unsafe selectors and invalid properties so only safe styles persist. */
export const sanitizeUiStyles = (input: unknown): UiStyleMap => {
  if (input == null || typeof input !== "object") return {};
  const out: UiStyleMap = {};
  for (const [selector, raw] of Object.entries(
    input as Record<string, unknown>,
  )) {
    if (!isSafeSelector(selector)) continue;
    const style = sanitizeStyle(raw);
    if (style) out[selector] = style;
  }
  return out;
};

/**
 * Build a stylesheet from (sanitized) overrides. Each declaration is marked
 * !important so a DEV tweak reliably wins over source styles. Output is
 * injection-safe because selectors and values are validated.
 */
export const generateUiCss = (styles: UiStyleMap): string => {
  const safe = sanitizeUiStyles(styles);
  const rules: string[] = [];
  for (const [selector, style] of Object.entries(safe)) {
    const decls: string[] = [];
    if (style.textColor) decls.push(`color:${style.textColor} !important`);
    if (style.backgroundColor) {
      decls.push(`background-color:${style.backgroundColor} !important`);
    }
    if (style.borderColor) {
      decls.push(
        `border-color:${style.borderColor} !important`,
        "border-width:1px !important",
        "border-style:solid !important",
      );
    }
    if (style.fontSize != null) {
      decls.push(`font-size:${style.fontSize}px !important`);
    }
    if (style.fontWeight != null) {
      decls.push(`font-weight:${style.fontWeight} !important`);
    }
    if (style.padding != null) {
      decls.push(`padding:${style.padding}px !important`);
    }
    if (decls.length > 0) rules.push(`${selector}{${decls.join(";")}}`);
  }
  return rules.join("\n");
};
