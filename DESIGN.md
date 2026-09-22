---
name: PRISM
description: Pacific Power Association utility-benchmarking platform — a dense, institutional data product with a navy console shell and a single amber signal.
colors:
  # Normative values are the oklch tokens in app/globals.css (light theme). DEV can
  # override brand/status/chart/background at Settings → Design (hex, stored in DB).
  signal-amber: "oklch(0.769 0.163 70.4)"
  console-navy: "oklch(0.21 0.034 264.665)"
  ink: "oklch(0.13 0.028 261.692)"
  cool-paper: "oklch(0.993 0.002 264.5)"
  sheet-white: "oklch(1 0 0)"
  panel-grey: "oklch(0.967 0.003 264.542)"
  annotation-grey: "oklch(0.551 0.027 264.364)"
  rule-line: "oklch(0.928 0.006 264.531)"
  focus-slate: "oklch(0.707 0.022 261.325)"
  approved-green: "oklch(0.598 0.145 148)"
  caution-amber: "oklch(0.705 0.162 57)"
  fault-red: "oklch(0.577 0.245 27.325)"
  reference-sky: "oklch(0.588 0.142 242)"
  chart-amber: "oklch(0.769 0.163 70.4)"
  chart-teal: "oklch(0.7 0.115 195)"
  chart-indigo: "oklch(0.55 0.15 268)"
  chart-rose: "oklch(0.62 0.18 12)"
  chart-lime: "oklch(0.72 0.16 135)"
  shell-navy-deep: "#0f172a"
  shell-navy-mid: "#1e293b"
  shell-navy-light: "#334155"
typography:
  headline:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.05em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.console-navy}"
    textColor: "{colors.cool-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  button-ghost:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  button-danger:
    textColor: "{colors.fault-red}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  input:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  badge:
    backgroundColor: "{colors.console-navy}"
    textColor: "{colors.cool-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    height: "20px"
  status-pill:
    textColor: "{colors.approved-green}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  table-header:
    backgroundColor: "{colors.panel-grey}"
    textColor: "{colors.annotation-grey}"
    typography: "{typography.label}"
    padding: "10px 16px"
  nav-top:
    backgroundColor: "{colors.shell-navy-deep}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.body}"
    padding: "12px"
  nav-top-active:
    textColor: "{colors.signal-amber}"
    typography: "{typography.body}"
  sidebar-item-active:
    backgroundColor: "{colors.rule-line}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: PRISM

## Overview

**Creative North Star: "The Engineer's Ledger"**

PRISM looks like a well-kept engineering ledger read under a dark control-room console. The
shell (top navigation) is deep navy and stays put; everything beneath it is paper: a barely-cool
off-white ground with pure white sheets (cards, tables, dialogs) resting on it. Type is IBM Plex,
a family drawn for technical documents, set small and dense because the primary user is a data
officer entering hundreds of values per period on an older, narrow screen. Figures line up
because every table uses tabular numerals by default.

Colour is rationed. One amber signal marks the current place (active navigation, the role badge,
the brand accent) and four status hues say exactly one thing each: approved, caution, fault,
reference. Nothing else is coloured. Depth comes from a hairline ring and the paper-on-paper
contrast, not from shadow. Motion only reports state (a menu opening, a sheet sliding, an AI turn
thinking) and is over in 100 to 300 ms.

This is an Operate surface. Familiarity is the feature: a category-fluent user should trust every
control on sight. The incumbent system was consolidated in September 2026 (semantic tokens
replaced ~13 ad-hoc hues; blue→info, red→danger, green→success). Confirmed rejections: no marketing
tone inside the app, no display fonts, no decorative motion.

**Key Characteristics:**
- Navy console shell over cool-paper ground and white sheets
- One amber signal; four single-meaning status hues; everything else neutral
- IBM Plex Sans at 12–14 px density, tabular numerals in every table
- Hairline-ring depth (1 px at 10% ink) with near-zero shadow
- 8 px corners on controls, 14 px on sheets, pills for badges
- State-only motion, 100–300 ms, reduced-motion honoured

## Colors

A rationed palette: neutrals carry the page, amber marks position, four status hues carry meaning.

### Primary
- **Signal Amber** (`{colors.signal-amber}`, hex approx. `#f59e0b`): the one brand colour. Active
  top-nav item, the role badge, the landing call-to-action, and `--chart-1`. Used on well under
  10% of any screen; its rarity is what makes it a signal. DEV-editable at Settings → Design.
- **Console Navy** (`{colors.console-navy}`): the `primary` action colour. Default buttons and
  badges, selected table rows (at 10%), and the dark end of the shell gradient. It is the ink of
  the system, not a decoration colour.

### Secondary (status)
Each hue has exactly one meaning and a paired foreground token. They render as tints
(`bg-<hue>/10` + `text-<hue>`) far more often than as solids.
- **Approved Green** (`{colors.approved-green}`): success, approved, true, healthy. Boolean cells,
  approved status pills, the success toast.
- **Caution Amber** (`{colors.caution-amber}`): warning, pending action. Deeper than Signal Amber
  so the two never read as the same thing.
- **Fault Red** (`{colors.fault-red}`, identical to `destructive`): danger, error, invalid, rejected.
  Validation borders and messages, the destructive button tint, the error toast.
- **Reference Sky** (`{colors.reference-sky}`): information, links inside prose, review context.

### Tertiary (charts)
A categorical sequence anchored on the brand: **Chart Amber, Chart Teal, Chart Indigo, Chart Rose,
Chart Lime** (`--chart-1..5`). Categorical only; never reuse a chart hue as a status hue. The BSC
strategy map and builders still carry their own lime/emerald/teal bands (deliberately excluded
from the token sweep; migration pending visual verification).

### Neutral
- **Ink** (`{colors.ink}`): body text, headings, icons.
- **Cool Paper** (`{colors.cool-paper}`): the app ground. Barely cool so white sheets lift off it.
- **Sheet White** (`{colors.sheet-white}`): cards, popovers, dialogs, table bodies.
- **Panel Grey** (`{colors.panel-grey}`): `muted`, `secondary`, `accent`. Table headers, hover
  fills, skeletons, secondary buttons.
- **Annotation Grey** (`{colors.annotation-grey}`): `muted-foreground`. Table header text,
  helper text, placeholders, false/inactive booleans.
- **Rule Line** (`{colors.rule-line}`): `border` and `input`. Every hairline. Also the active
  sidebar fill.
- **Focus Slate** (`{colors.focus-slate}`): `ring`. The 3 px focus halo at 50% opacity.
- **Shell Navy** deep/mid/light (`#0f172a → #1e293b → #334155`): the top-nav gradient. These are
  raw slate utilities today, not tokens; see Known deviations.

### Named Rules
**The One Signal Rule.** Amber marks *where you are* (active nav, role, brand). It never marks
status, never fills a surface, and never appears twice in one component.

**The Single Meaning Rule.** Green, amber, red and sky each carry one meaning app-wide. New UI
reaches for `success/warning/danger/info` tokens, never `green-*/red-*/blue-*` utilities.

**The Never-Colour-Alone Rule.** Status is always colour plus a word or an icon (WCAG 2.1 AA,
PRODUCT.md). A green dot with no label is a defect.

## Typography

**Display Font:** none. Product UI carries one family.
**Body Font:** IBM Plex Sans (with system-ui, sans-serif) — weights 400 / 500 / 600 / 700, loaded
via `next/font`, exposed as `--font-sans`.
**Label/Mono Font:** IBM Plex Mono (with ui-monospace) — weights 400 / 500 / 600, exposed as
`--font-mono`. For ids, codes, formulas, commit SHAs and measured values in data cells; never as a
"technical" costume for prose.

**Character:** engineered and institutional. Plex has a slightly squared, drafting-table feel and
strong tabular numerals, which is why it was chosen over a generic humanist sans. It reads as a
ledger, not a brochure.

### Hierarchy
The scale is fixed rem steps (no fluid clamps) with a tight ratio, because there are many type
elements per screen and users sit at consistent DPI.
- **Headline** (600, 1.5 rem / 24 px, 1.25): page titles on the few full-page surfaces (settings
  detail pages, Design tokens). Rare.
- **Title** (700, 1.125 rem / 18 px, 1.4): the workhorse page/section heading (`text-lg font-bold`,
  13 uses). Card titles drop to 16 px / 500.
- **Body** (400, 0.875 rem / 14 px, 1.5): controls, form text, prose. Buttons and inputs are 14 px /
  500. Prose measure 65–75 ch where it exists (docs, AI answers); UI text is not measured.
- **Data** (400, 0.75 rem / 12 px, 1.4, `tabular-nums`): the densest and most used size (505
  uses). Table cells, helper text, pills. Tables set `font-variant-numeric: tabular-nums` globally.
- **Label** (600, 0.75 rem / 12 px, +0.05 em, UPPERCASE): table column headers, section eyebrows
  inside settings panels, the sidebar "MENU" mark. Always `muted-foreground`.
- **Mono** (400, 0.75 rem, IBM Plex Mono): identifiers and formulas only.

### Named Rules
**The Twelve-Fourteen Rule.** Almost everything a data officer reads is 12 px or 14 px. Reach for
18 px only for a page or section title, 24 px only when a page has a single heading.

**The Real Numerals Rule.** Any column of figures is tabular. Inherit it from `table`; add
`tabular-nums` yourself on non-table numeric layouts.

## Layout

A fixed-height app frame: sticky navy top bar (48 px content + 12 px padding), then a flex row of
an optional left sidebar (192 px, collapsible to 40 px, 300 ms) and a scrolling `main` with 8 px
outer padding. Pages typically add 16 px padding and 16 px vertical rhythm (`p-4 space-y-4`).
Dense screens (data entry, DataTable) run edge to edge inside `main`; settings detail pages centre
at 42–48 rem (`max-w-2xl`/`max-w-3xl`).

Spacing rhythm is Tailwind's 4 px grid used at four practical steps: 4 px inside controls, 8 px
between siblings, 16 px between groups, 24 px inside cards (`py-6 px-6`; the `sm` card drops to
16 px). Table cells are 10 px vertical / 16 px horizontal in headers, 8 px horizontal in cells.
Grids are two columns of fields in forms (`sm:grid-cols-2`) and two cards across on overview
pages.

Responsive behaviour is structural, not typographic: the top nav collapses to a slide-down menu
below 768 px, the sidebar collapses by toggle, dialogs cap at `calc(100% - 2rem)` and 28 rem on
`sm+`, and wide tables scroll inside their own container (`min-w-max` + `overflow-auto`) so the
page never scrolls sideways. Breakpoints are Tailwind defaults (640 / 768 / 1024 / 1280 px).
Design for ~1366 px wide first (PRODUCT.md); mobile is not a confirmed working condition.

## Elevation & Depth

A hybrid that is almost flat. Depth is conveyed by **tonal layering** (white sheets on cool paper)
plus a **hairline ring** (`ring-1 ring-foreground/10`, i.e. 1 px of ink at 10%) on cards and
dialogs, with the smallest shadow (`shadow-xs`) as a whisper. Larger shadows exist in the codebase
(`shadow-sm` ×15, `shadow-md` ×13, `shadow-lg` ×4) mostly on floating things: the sidebar toggle,
dropdown menus, the floating chat and the DEV tools handle. Nothing at rest carries a heavy shadow.
Overlays dim the page only to 10% black with a light backdrop blur.

### Shadow Vocabulary
- **Whisper** (`shadow-xs`): cards, outline buttons, dialogs. Pairs with the hairline ring.
- **Lift** (`shadow-sm`/`shadow-md`): things that float above the page — menus, popovers, the
  floating chatbot, the draggable DEV tools handle.
- **None**: tables, table headers, inputs at rest (inputs carry a hairline border instead).

### Named Rules
**The Hairline Lift Rule.** A surface lifts with a 1 px 10%-ink ring and paper contrast first;
shadow is a whisper, never the mechanism. No zero-offset coloured glows on static UI (the
`glow`/`bobble` keyframes in globals.css are legacy and unused; do not revive them).

## Shapes

Softly squared. The base radius is 10 px (`--radius: 0.625rem`) and everything derives from it:
controls (buttons, inputs, selects, sidebar items, skeletons) use 8 px (`rounded-md`, 146 uses),
sheets (cards, dialogs, the AI thinking shell) use 14 px (`rounded-xl`), badges and status pills
are full pills. Borders are always 1 px Rule Line; there are no 2 px decorative borders on cards.
Inputs are transparent with a hairline border, not filled. Checkboxes are 16 px squares at 4 px
radius. Icons are lucide, 16 px inside controls (`size-4`), one stroke weight throughout.

Two incumbent exceptions carry a thick coloured left edge (4–7 px): data-entry value inputs (status
stripe) and review-KPI sections. They are under review (see Known deviations); do not add new ones.

## Components

### Buttons
Quiet and consistent; the same shape everywhere.
- **Shape:** 8 px corners (`rounded-md`), 36 px tall (`h-9`), 10 px horizontal padding, 14 px /
  500, `sm` 32 px, `xs` 24 px, icon sizes square.
- **Primary (`default`):** Console Navy fill, Cool Paper text; hover to 80% opacity.
- **Outline:** Cool Paper fill, hairline Rule Line border, whisper shadow; hover Panel Grey.
- **Secondary:** Panel Grey fill, Ink text. **Ghost:** transparent; hover Panel Grey.
- **Destructive:** Fault Red *tint* (10% fill, red text), never a solid red button.
- **Link:** navy text, underline on hover, 4 px underline offset.
- **Focus:** 3 px Focus Slate halo at 50% plus border to ring colour (`focus-visible:ring-3`).
- **Disabled:** 50% opacity, pointer events off. Invalid: red border + 20% red ring.

### Inputs / Fields
- **Style:** 36 px tall, 8 px corners, transparent fill, 1 px Rule Line border, 12 px horizontal
  padding, 14 px text, placeholder in Annotation Grey (auto-generated "Enter <Label>").
- **Focus:** border becomes Focus Slate and a 3 px 50% halo appears; transition on colour and
  box-shadow only.
- **Error:** border Fault Red + 20% red ring (`aria-invalid`). **Disabled:** 50% opacity, not-allowed
  cursor. Selects share the exact recipe with a lucide chevron in Annotation Grey.
- **Checkbox:** 16 px, Ink border at 40%; checked fill is currently raw `lime-500` (deviation).

### Cards / Containers
- **Corner Style:** 14 px (`rounded-xl`).
- **Background:** Sheet White on Cool Paper.
- **Shadow Strategy:** hairline ring + whisper shadow (Elevation).
- **Border:** none beyond the ring.
- **Internal Padding:** 24 px, 24 px gap between header/content/footer; `sm` variant 16 px.
- **Title:** 16 px / 500; description 14 px Annotation Grey.

### Chips (Badges and status pills)
- **Badge:** 20 px pill, 12 px / 500, navy fill (default), Panel Grey (secondary), red tint
  (destructive), hairline (outline).
- **Status pill (pattern, not a primitive):** `rounded-full bg-<hue>/10 px-2.5 py-0.5 text-xs
  font-medium text-<hue>` — the standard way to show approved / warning / fault / info state.

### DataTable (signature)
The system's most used surface (`components/tables/data-table.tsx`).
- **Header:** sticky, Panel Grey fill, cells 10 px × 16 px, Label style (12 px / 600 / uppercase /
  +0.05 em) in Annotation Grey. Sortable headers reveal chevrons on hover (`group/th`), hover to
  Ink on Panel Grey, active sort stays Ink.
- **Body:** 12 px text, 8 px horizontal cell padding, tabular numerals, row hover Panel Grey at
  40%, selected row Console Navy at 10% (15% on hover). Booleans render as Approved Green /
  Annotation Grey text, never a bare icon.
- **Frame:** scrolls inside its own container; `fillHeight` mode makes the table the only scroller
  in master/detail layouts. DEV-only Columns chooser, sort and filter icons live in the header row.

### Navigation
- **Top bar:** sticky, gradient Shell Navy deep → mid → light, white 14 px / 500 links with 32 px
  gaps, logo left. **Active item:** Signal Amber + bold (the One Signal Rule). Hover dims to
  slate-400. Role badge: Signal Amber fill, Shell Navy text, 12 px. Below 768 px a slide-down menu
  (200 ms) on Shell Navy mid.
- **Sidebar:** 192 px, right hairline, "MENU" mark in 12 px / 900 slate-400 uppercase with a list
  icon, items 8 px × 16 px with 8 px corners; **active** item Rule Line fill + bold; collapses to
  40 px with a round white toggle. (Uses raw slate utilities; see Known deviations.)

### Dialogs and Sheets
- Centre dialog: Sheet White, 14 px corners, hairline ring, 24 px padding, 24 px gaps, max 28 rem on
  `sm+`; enters with 95% zoom + fade over 100 ms. Side sheet: slides 10% from its edge, same
  timing. Overlay: 10% black + `backdrop-blur-xs`. Update forms inside sheets use a scrolling field
  grid with a pinned Save footer.

### State messages, skeletons, toasts
- **State message:** 8 px corners, hairline border, Panel Grey at 20–30% (`empty`/`loading`), Fault
  Red tint + red text (`error`); 12–14 px. Empty states say what to do next, not "nothing here".
- **Skeleton:** Panel Grey, 8 px corners, pulse.
- **Toasts (sonner):** solid `success/danger/warning/info` fills with white 14 px / 500 text, 8 px
  corners, bottom-right, 6 s.

### AI thinking indicator (signature)
A 14 px-cornered shell in a faint slate gradient with a 10 px spinning orb (1 s linear + 1.5 s soft
glow) and a 4 px shimmer rail (1.2 s). The one place a subtle glow is sanctioned, because it
reports "working". Both animations stop under `prefers-reduced-motion`. Streaming text ends in a
1 s blinking 2 px caret.

### DEV tooling (DEV role only)
A draggable "⠿ DEV TOOLS" handle (lifted shadow) that opens Design mode (Alt+E), reorder (Alt+R)
and width/column controls (Alt+W), plus the Design tokens page at Settings → Design with live colour
pickers. Styled in the same vocabulary; never visible to other roles.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens for every colour decision: `bg-brand`, `text-success`,
  `bg-danger/10`, `text-info`, `text-muted-foreground`, `border-border`.
- **Do** show status as colour **plus** a word or lucide icon, every time.
- **Do** keep data surfaces at 12 px with tabular numerals and 8 px cell padding; keep controls at
  14 px / 36 px tall.
- **Do** lift a surface with the hairline ring + whisper shadow and paper contrast (`bg-card` on
  `bg-background`).
- **Do** use 8 px corners on controls, 14 px on sheets, pills on badges — derive from `--radius`.
- **Do** keep motion to state changes at 100–300 ms with an ease-out, and honour
  `prefers-reduced-motion`.
- **Do** put Signal Amber only on "you are here" (active nav, role badge, brand mark).
- **Do** design for ~1366 px, slow links and once-a-year users: labels and empty states carry
  the instructions (PRODUCT.md).
- **Do** read sector words from `lib/terminology` (`useTerm` / `resolveTerm`); never hardcode
  "Grid".

### Don't:
- **Don't** use raw `red-*`, `green-*`, `blue-*`, `lime-*`, `sky-*` utilities in new UI; the
  detector and the token sweep both flag them.
- **Don't** put a second opacity on a token class (`bg-success/10/40` emits nothing).
- **Don't** nest cards, or build a page from same-size icon-heading-text cards.
- **Don't** add thick coloured left/right borders (>1 px) to new cards, alerts or inputs.
- **Don't** use gradient text, zero-offset coloured glows, or decorative page-load choreography.
- **Don't** use IBM Plex Mono as a "technical" costume for prose; it is for ids, codes, formulas
  and measured values.
- **Don't** render a gap as `0`: "not available" stays visibly not available (PRODUCT.md).
- **Don't** introduce a display face, a fluid `clamp()` heading, or a modal for a task that needs
  neither interruption nor protected focus.

### Known deviations (incumbent, to migrate — not licences)
- Top nav and sidebar use raw `slate-*` utilities for the shell and active item instead of tokens;
  this also gates the dark-mode toggle.
- Checkbox checked state is raw `lime-500` rather than `--success`.
- Thick left stripes (`border-l-4` / `border-l-7`) on data-entry value inputs, managed-list input,
  review-KPI sections and one landing quote (9 sites, detector `side-tab`).
- Slate ink on Signal Amber in three places (landing CTA, role badge, formula-builder card);
  the detector prefers a warm dark ink on a coloured surface.
- BSC strategy map / builders use their own lime/emerald/teal categorical bands instead of
  `--chart-1..5`.
- AI chat code blocks use a fixed highlight.js palette (hex, light + dark). Sanctioned: syntax
  colouring is categorical, like chart bands.
