# PRISM Product Design for Google Stitch

## 1. Product Summary

PRISM is a web platform for Pacific Power Association benchmarking workflows. It
supports:

- Utility and non-utility user authentication
- KPI and input data entry with contextual filters
- KPI review with editable inputs, comment threads, and recalculation
- Balanced scorecard analysis and drilldown
- Settings-driven administration (roles, service areas, managed lists, reporting
  dimensions)

This document defines a practical design direction for generating and refining
PRISM screens in Google Stitch.

## 2. Users and Permissions

Primary user groups:

- Utility contributors: submit and maintain operational inputs
- Reviewers and benchmark managers: inspect KPI outputs and scorecard trends
- Admin users: manage lists, mappings, and system settings

Permission implications for UI:

- Read-only users must still see complete KPI/scorecard context
- Edit controls must appear only for authorized roles
- Conflict and validation feedback must be visible and unambiguous

## 3. Information Architecture

Top-level navigation:

- Home
- Dashboard
- Data Entry
- Settings
- Docs

Data Entry area:

- Report period list
- Enter Data
- Review KPI
- KPI Worker
- Balanced Scorecard

Settings area:

- Relevance
- Service Areas
- Reporting
- Inputs
- KPI
- Managed Lists
- Roles
- Users
- Organisations
- Countries
- Energy Resources

## 4. UX Principles

1. Context before action Always keep selected report context visible near the
   top of task screens.

2. Deterministic filtering Filter changes should immediately update dependent
   options and displayed records.

3. Dense but readable data layouts Use compact table/card hybrids with clear
   typographic hierarchy.

4. Explain system state Loading, empty, validation, conflict, and sync states
   must be explicit and persistent long enough to read.

5. Progressive disclosure Hide advanced detail until needed (details panels,
   comment threads, drilldowns).

## 5. Visual Direction

Tone:

- Professional, analytical, and calm
- High legibility over decorative styling
- Data-rich without visual clutter

Color direction (recommended Stitch seed and semantic palette):

- Primary seed: #334155 (slate-700 family)
- Background: #f8fafc
- Surface: #ffffff
- Text primary: #0f172a
- Text secondary: #475569
- Accent/warning: #fbbf24
- Success: #84cc16
- Error: #ef4444
- Info: #3b82f6

Typography:

- Body and headings: Noto Sans (matches current app direction)
- Numeric/tabular contexts: use tabular numbers for KPI values and percentages

Shape and spacing:

- Corner radius baseline: 10px
- Dense input/table spacing in data-heavy screens
- Larger spacing for landing and auth surfaces

## 6. Component System for Stitch

Core primitives to generate and reuse:

- Top navigation bar with logo, primary links, user area
- Collapsible contextual sidebar
- Filter row with compact selects and labels
- Status badges (On Track, At Risk, Off Track, Pending)
- KPI row shell with three-column layout
- Input editor row with inline validation
- Comment thread panel with author and timestamp metadata
- Scorecard perspective cards
- Drilldown table with contribution values
- Alert blocks for loading, empty, error, and conflict states

Status language:

- Loading: "Loading KPI rows..."
- Empty: "No records found for selected filters."
- Conflict: "This input changed since you opened it. Latest value loaded;
  re-apply edits to save."
- Validation: "Enter a valid numeric value within allowed range."

## 7. Screen Specs for Google Stitch

### 7.1 Home

Goal:

- Communicate platform purpose and direct users to Dashboard

Layout:

- Hero with PPA branding
- Four feature cards
- Historical/context narrative section

Design notes:

- Use subtle grid or pattern background
- Keep CTA high-contrast and obvious

### 7.2 Auth (Login/Register)

Goal:

- Support magic-link login and account request flow

Layout:

- Tabbed form (Login, Register)
- Register includes role, organization, and optional non-utility fields

Design notes:

- Clear instructional banner above each form mode
- Strong validation and disabled submit states

### 7.3 Dashboard

Goal:

- Host Power BI report with minimal framing overhead

Layout:

- Header context
- Embedded analytics canvas

Design notes:

- Keep surrounding UI neutral to avoid competing with chart colors
- Provide loading and embed error states

### 7.4 Data Entry Report Period List

Goal:

- Let users pick reporting context and inspect process status

Layout:

- Optional quick action to Balanced Scorecard
- Wide status table with sticky header

Design notes:

- Color-coded status dots must include text labels
- Preserve readability in dense rows

### 7.5 Review KPI Workspace

Goal:

- Provide review and correction workflow for KPI calculations

Layout:

- Top sticky filter row: report type, report period, KPI category, KPI
  subcategory, service area
- Repeating KPI rows in three columns:
  - Left: input list, values, edit controls, comment entry points
  - Middle: formula expression and dependencies
  - Right: computed result and status

Design notes:

- Keep formula column visually distinct but not dominant
- Inline editing should not shift row layout drastically
- Comment thread opens in side panel or expandable block

### 7.6 Balanced Scorecard

Goal:

- Summarize performance and enable perspective drilldown

Layout:

- Overall score panel
- Perspective cards with weighted score and status mix
- Drilldown panel listing KPI contributors and exclusions

Design notes:

- Highlight worst-performing perspective using semantic emphasis, not alarm
  colors alone
- Include excluded counts and reasons in an audit-friendly format

### 7.7 Settings Workspace

Goal:

- Manage configuration entities with reliable CRUD patterns

Layout:

- Left navigation to settings categories
- Data table plus create/update form patterns

Design notes:

- Keep form interaction consistent across entities
- Use confirmation patterns for destructive actions

## 8. Responsive Behavior

Desktop (>= 1024px):

- Full top nav, sidebar visible where relevant
- KPI row uses full three-column layout

Tablet (768px to 1023px):

- Compact nav spacing
- KPI row shifts to two-tier layout (inputs + formula, result below/right)

Mobile (< 768px):

- Top nav collapses to menu trigger
- Sidebar hidden by default
- KPI row stacks vertically in order: context, inputs, formula, result, comments
- Filter row wraps into multi-line controls

## 9. Accessibility Rules

- All filter controls and row actions keyboard-operable
- Every control has an explicit label
- Status changes announced via polite live regions where applicable
- Badge color is never the only state indicator
- Maintain minimum contrast ratio 4.5:1 for normal text

## 10. Motion and Feedback

- Use brief transitions (120ms to 200ms) for menu, panel, and row expansion
- Avoid decorative animation on data updates
- During recalculation, show local row-level pending indicator
- On successful save, show lightweight confirmation toast

## 11. Google Stitch Execution Plan

### 11.1 Design System Setup

Use this as a starting configuration in Stitch:

- Appearance: Light mode
- Body font: Noto Sans
- Headline font: Noto Sans
- Roundness: 8 to 12
- Custom primary color: #334155

### 11.2 Generation Prompts

Home prompt:

"Design a modern enterprise landing page for PRISM, a utility benchmarking
platform. Include hero, four feature cards, and an about/history section. Use
slate and neutral tones with amber accents, strong readability, and a
professional data-platform look."

Auth prompt:

"Design an authentication screen with tabbed Login and Register forms. Login
uses email magic link. Register includes first name, last name, email,
organization select, role select, optional non-utility checkbox, and conditional
text areas. Include clear validation and instructional banners."

Review KPI prompt:

"Design a data-dense KPI review workspace with sticky filter controls at top and
repeating KPI rows in three columns: left input values with inline edit and
comment actions, center KPI formula, right KPI result and status. Include
loading, empty, error, and optimistic concurrency conflict states."

Scorecard prompt:

"Design a balanced scorecard dashboard for KPI performance: overall score
summary, perspective cards with weighted scores and status distribution, and a
drilldown table for KPI contributors and excluded records with reasons."

Settings prompt:

"Design a settings management workspace with left category navigation, reusable
CRUD data table patterns, compact forms, and confirmation dialogs for
destructive actions."

### 11.3 Variant Generation

Generate variants by aspect:

- Layout: compact vs spacious data density
- Color scheme: neutral-slate baseline vs slightly warmer neutral surfaces
- Text hierarchy: stronger numeric emphasis for KPI and scorecard screens

### 11.4 Apply and Refine

- Apply the chosen design system to all generated screens
- Keep interaction behavior consistent across Data Entry, Review KPI, and
  Scorecard
- Prioritize visual consistency of filter bars, table headers, badges, and
  alerts

## 12. Acceptance Checklist for Design Output

A Stitch-generated design is acceptable when:

- Top navigation and data-entry navigation are consistent across screens
- Filter bars are reusable and visually consistent
- KPI review rows clearly preserve the left/middle/right structure
- Scorecard shows both summary and drilldown with exclusion visibility
- All major states (loading, empty, error, validation, conflict) are designed
- Mobile and tablet behavior is intentionally defined, not auto-collapsed
  defaults

## 13. Out of Scope for This Design Pass

- Backend data model changes
- KPI formula logic changes
- Authorization policy redesign
- New reporting domains beyond current navigation structure
