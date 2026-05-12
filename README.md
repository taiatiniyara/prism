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
- `PRISM_TRAINING_API_BASE_URL` (required for legacy `/api/fact*` and `/api/dim*` endpoint parity proxy)
- `PRISM_TRAINING_API_KEY` (optional fallback for legacy prism-training `Authorization` header)

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

### Chatbot Integration

- `OPENAI_API_KEY`
- Chatbot model is fixed to `gpt-5`
- `CHATBOT_TIMEOUT_MS` (optional, defaults to `45000`)
- `CHATBOT_MAX_OUTPUT_TOKENS` (optional, defaults to `2500`)

The chatbot route `POST /api/chatbot` supports capability-grounded responses and
may return:

- `capabilitiesUsed`: resolved backend capability names used to ground the reply
- `recommendedView`: rendering hint (`text`, `table`, `bar-chart`, `line-chart`,
  `leaderboard`, `sankey`, `heatmap`, `radar`, `scatter`, `dashboard`)
- `sessionId` (stream `meta` event): persisted chat session id used for this
  turn

Chat persistence APIs:

- `GET /api/chatbot/sessions`: list current user's recent chat sessions
- `POST /api/chatbot/sessions`: create a new chat session
- `GET /api/chatbot/sessions/[sessionId]/messages`: get messages for a session
- `PATCH /api/chatbot/sessions/[sessionId]`: rename a session
- `DELETE /api/chatbot/sessions/[sessionId]`: delete a session

Current capability domains include report-period status, performance snapshots,
scorecard snapshots, review-KPI diagnostics, benchmarking, trend signals,
anomaly/change-digest signals, governance/audit context, configuration/setup
options, and visual presentation hints.

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
- `lib/`: auth/session/business service modules
- `test/`: Vitest setup, unit tests, integration tests, fixtures
- `specs/`: feature specs and planning artifacts

## API Notes

- Auth API route is exposed through `app/api/auth/[...all]/route.ts`.
- Additional route handlers are grouped under `app/api/data-entry`,
  `app/api/settings`, and related feature folders.
- Legacy prism-training parity routes are available through
  `app/api/[legacy]/route.ts` for supported `/api/fact*` and `/api/dim*`
  endpoint names.

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
