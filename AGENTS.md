# PRISM — Agent Guide

## Quick start

```powershell
Copy-Item .env.example .env   # fill in real values
npm install
npm run db-push-safe           # fix UUID timestamps, then push schema
npm run dev                    # webpack dev server on http://localhost:3554
```

## Commands

| Command | Notes |
|---|---|
| `npm run dev` | Uses `--webpack` (not turbopack by default) |
| `npm run dev:turbo` | Turbopack alternative |
| `npm run start` | Prod server on port **3555** |
| `npm run lint` | ESLint |
| `npm run test` | All Vitest tests |
| `npm run test:unit` | `vitest run test/unit` |
| `npm run test:integration` | `vitest run test/integration` |
| `npm run test:watch` | Vitest interactive watch |
| `npm run db-push-safe` | Runs `db-fix-uuid-timestamps` then `db-push` |
| `npm run db-push` | `drizzle-kit push --config ./db/config.ts` |
| `npm run git-push` | Builds, commits, pushes |

## Architecture

- **Next.js 16 App Router**, React 19, TypeScript, Tailwind CSS 4
- **Drizzle ORM + PostgreSQL** — schema in `db/schema/*.ts`, config at `db/config.ts`
- **Better Auth** with email/password + magic link; Drizzle adapter, rate limiting (100 req/15min)
- **`proxy.ts`** — middleware protecting `/dashboard/*`, `/data-entry/*`, `/settings/*`, `/profile/*`, `/docs/*`
- **Path alias**: `@/*` → project root (in tsconfig and vitest config)
- **DB connection** (`db/connection.ts`) uses a global `__prismPool` to survive hot-reloads; PG pool timeouts all set to 30s
- **AI/chatbot**: Anthropic Claude (Sonnet 4.6 primary, Haiku 4.5 fallback), 67 tools (38 PRISM-native + 29 Power BI domain), AI SDK v6.0.168
- **AI streaming**: Character-by-character `requestAnimationFrame` reveal, collapsible thinking/reasoning dropdown with tool process tracking, animated thinking indicator
- **Rate limiting**: In-memory rate limiter (20 requests/min, 100 requests/15min) enforcement on AI chat route; usage tracking persisted to DB for analytics
- **Scorecard**: Removed from AI — scorecard integration has been fully extracted from the AI feature. AI uses Power BI + PRISM-native benchmarking/KPI diagnostics instead.
- **Power BI AI**: 19 schema tables, 55 pre-built DAX query templates, 36 AI tools. Domain coverage: reliability, generation, distribution, financials, customers, workforce, safety, diesel/fuel, climate, island context, tariffs, renewables, governance, leadership, transmission, air connectivity. Features: trend forecasting, KPI correlations, risk scoring, executive briefings, donor report auto-fill, investment prioritization, regulatory tracking, what-if modeling, anomaly detection.

## Testing

- Vitest + jsdom, setup: `test/setup.ts` (imports `@testing-library/jest-dom/vitest`)
- Glob: `test/**/*.test.{ts,tsx}`, `passWithNoTests: true`
- Unit tests: `test/unit/`, integration: `test/integration/`, fixtures: `test/fixtures/`
- No database or network mocking is set up by default — integration tests likely need a real DB

## Key env vars

- `DATABASE_URL` (PostgreSQL)
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (or `NEXT_PUBLIC_APP_URL`)
- `NEXT_PUBLIC_BETTER_AUTH_URL` (auth client)
- `PRISM_TRAINING_API_BASE_URL` — legacy `/api/fact*`/`/api/dim*` proxy
- `PRISM_TRAINING_MIGRATION_URL` — production migration sync (falls back `/api/mig/*`)
- `ANTHROPIC_API_KEY` — AI/chatbot uses Claude (Sonnet 4.6 primary, Haiku 4.5 fallback)
- Power BI: `POWERBI_CLIENT_ID`, `POWERBI_CLIENT_SECRET`, `POWERBI_TENANT_ID`, `POWERBI_WORKSPACE_ID` (or `POWERBI_WORKSPACE_NAME`), `POWERBI_REPORT_ID` (or `POWERBI_REPORT_NAME`), `POWERBI_EMBED_URL`, `POWERBI_DATASET_ID` (or `POWERBI_DATASET_NAME`)
- Power BI (optional): `POWERBI_EFFECTIVE_IDENTITY_UPN`, `POWERBI_EFFECTIVE_IDENTITY_ROLES` — for RLS-enabled datasets; passed as `impersonatedUserName` on DAX queries
- SMTP for magic-link emails: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

## Notable quirks

- `npm run dev` uses webpack explicitly (`--webpack`) — not the default turbopack
- `package.json` overrides pin `postcss` to 8.5.10 and `esbuild` to 0.28.0
- shadcn/ui style is `radix-vega` (not default), with lucide icons
- `npm run deploy-dev` rebuilds locally, pushes to `main`, then drops/recreates DB on server — **development-only**
- `npm run git-push` auto-generates PRISM AI prompt, builds, stages all, commits, and pushes — run instead of manual push
- `.github/copilot-instructions.md` exists with generic guidance — `AGENTS.md` supersedes it for OpenCode
