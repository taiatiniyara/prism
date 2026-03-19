# Quickstart: Data Entry Filters and Context

## Prerequisites

- Node.js environment matching project baseline.
- Access to a seeded or development database containing:
- report types and report periods,
- input categories and subcategories,
- service areas,
- energy resources including generation resources with mixed `is_virtual`
  values.
- Authenticated user account with data-entry permissions.

## Run

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open the data-entry flow in browser and authenticate.

## Validation Commands

Run before merge:

```bash
npm run lint
npm run build
```

Run automated checks added for this feature (exact command will match
implementation choice):

```bash
npm test
```

## Manual Verification Flow

1. Report type and report period persistence

- Select report type and report period.
- Refresh page and verify selections persist and rows remain filtered.

2. Category/subcategory cascade

- Select category A, then subcategory A1.
- Switch to category B where A1 is invalid.
- Verify subcategory is reset to valid options for B.

3. Operational visibility rule

- Select category `Operational`.
- Verify service area selector appears.
- Select non-Operational category and verify service area selector disappears.

4. Generation grouping rule

- Select subcategory `Generation` and a service area.
- Verify only non-virtual generators are shown.
- Verify inputs are grouped under each generator.

5. Invalid cookie sanitization

- Set one or more cookie IDs to stale/invalid values.
- Reload and verify invalid cookies are cleared and safe defaults are applied
  without blocking page load.

6. Data type-based control rendering

- Verify control type shown for each row matches mapped data type.
- Verify unsupported type falls back safely while preserving row visibility.

## Accessibility Verification

- Tab through all selectors and ensure keyboard operation is complete.
- Verify selector labels are announced by screen readers.
- Validate loading, empty, and error states are perceivable and readable.
