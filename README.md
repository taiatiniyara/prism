# PRISM

PRISM is a Next.js 16 platform for Pacific Power Association benchmarking. It
supports authenticated workflows for KPI data entry, KPI review, balanced
scorecard analysis, and settings-driven administration.

## Main Features

- Better Auth based authentication (email/password plus magic-link support)
- Role-aware access and blocked-user gating
- Data-entry workflows with contextual filters and KPI review screens
- Balanced scorecard views and drilldown support
- Embedded Power BI dashboard integration
- Settings management modules (roles, users, service areas, reporting, inputs,
  managed lists, organisations, countries, energy resources, relevance)

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Drizzle ORM + PostgreSQL
- Better Auth
- Tailwind CSS 4
- Vitest + Testing Library

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL (reachable by `DATABASE_URL`)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create your `.env` file from `.env.example`, then fill in real values:

```bash
cp .env.example .env
```

```powershell
Copy-Item .env.example .env
```

3. Prepare the database schema:

```bash
npm run db-push-safe
```

4. Start the development server:

```bash
npm run dev
```

The app runs on `http://localhost:3554` in development.

## Environment Variables

Set these values in `.env` before running the app.

### Core

- `DATABASE_URL` (PostgreSQL connection string)
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` or `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL` (used by the auth client)
- `PRISM_TRAINING_API_BASE_URL` (required for legacy `/api/fact*` and
  `/api/dim*` endpoint parity proxy)
- `PRISM_TRAINING_MIGRATION_URL` (required in production for migration sync
  endpoints like `/api/migration/*` and `/api/mig/*`)
- `PRISM_TRAINING_API_KEY` (optional fallback for legacy prism-training
  `Authorization` header)
- `PRISM_TRAINING_MIGRATION_KEY` (optional API key sent as `x-migration-key` for
  migration sync calls)

Migration sync calls attempt the configured `/api/migration/*` endpoint first
and then fall back to `/api/mig/*` if JSON responses are unavailable from the
primary endpoint.

### SMTP (magic-link email delivery)

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

### Power BI Integration

- `POWERBI_CLIENT_ID`
- `POWERBI_CLIENT_SECRET`
- `POWERBI_TENANT_ID`
- `POWERBI_WORKSPACE_ID`
- `POWERBI_REPORT_ID`
- `POWERBI_EMBED_URL`
- `POWERBI_DATASET_ID`

### AI (Anthropic Claude)

- `ANTHROPIC_API_KEY`
- Access via `/prism-ai` page or floating chat button (bottom-right on all
  pages)
- 26 AI tools covering KPI status, scorecards, benchmarking, trends,
  diagnostics, governance, compliance, what-if analysis, and on-the-fly KPI
  calculation
- Session persistence via `GET/POST/DELETE /api/ai/sessions`
- Full documentation: `docs/ai-capabilities.md`

## Scripts

- `npm run dev`: start Next.js dev server on port `3554`
- `npm run build`: production build
- `npm run start`: start production server on port `3555`
- `npm run lint`: run ESLint
- `npm run test`: run all Vitest tests
- `npm run test:unit`: run unit tests only
- `npm run test:integration`: run integration tests only
- `npm run test:watch`: run Vitest in watch mode
- `npm run db-fix-uuid-timestamps`: apply legacy UUID-to-timestamp fixes
- `npm run db-push`: push Drizzle schema to database
- `npm run db-push-safe`: run fix script, then schema push
- `npm run deploy-dev`: run deployment script in `scripts/deploy-dev.sh`

## Project Layout

- `app/`: routes, layouts, and API handlers
- `components/`: shared UI and feature components
- `db/`: Drizzle config, connection, schema, scripts, migrations output
- `lib/`: auth/session/business service modules, shared utilities (logger, dim
  route helper)
- `test/`: Vitest setup, unit tests, integration tests, fixtures, manual test
  scripts
- `specs/`: feature specs and planning artifacts
- `graphify-out/`: knowledge graph outputs (HTML, JSON, report)
- `docs/`: security review reports

## API Notes

- Auth API route is exposed through `app/api/auth/[...all]/route.ts`.
- Additional route handlers are grouped under `app/api/data-entry`,
  `app/api/settings`, and related feature folders.
- Legacy prism-training parity routes are available through
  `app/api/[legacy]/route.ts` for supported `/api/fact*` and `/api/dim*`
  endpoint names.
- Dim routes share a common helper at `lib/dim-route-helper.ts` which
  consolidates authentication and managed-list lookup patterns.
- Structured logging is available via `lib/logger.ts` — import `logger` and use
  `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`. Set
  `LOG_LEVEL` env var to control verbosity (defaults to `info` in production,
  `debug` in development).

## Testing

Vitest is configured with:

- `jsdom` environment
- setup file at `test/setup.ts`
- test glob `test/**/*.test.{ts,tsx}`

Run all tests with:

```bash
npm run test
```

## Deployment

The current development deployment helper is `scripts/deploy-dev.sh`.

Important:

- The script builds locally, pushes to `main`, then runs remote deploy steps.
- On the server it drops and recreates the `prism` database before
  `npm run db-push`.
- Treat this script as development-only unless it is revised for safe production
  behavior.

## Project Governance

Planning and delivery standards are defined in
`.specify/memory/constitution.md`. When creating or updating feature specs,
plans, and task lists, align outputs to the constitution principles and required
validation gates.
