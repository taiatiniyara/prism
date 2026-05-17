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
| `npm run git-push` | Generates chatbot prompt, builds, commits, pushes |

## Architecture

- **Next.js 16 App Router**, React 19, TypeScript, Tailwind CSS 4
- **Drizzle ORM + PostgreSQL** — schema in `db/schema/*.ts`, config at `db/config.ts`
- **Better Auth** with email/password + magic link; Drizzle adapter, rate limiting (100 req/15min)
- **`proxy.ts`** — middleware protecting `/dashboard/*`, `/data-entry/*`, `/settings/*`, `/profile/*`, `/docs/*`
- **Path alias**: `@/*` → project root (in tsconfig and vitest config)
- **DB connection** (`db/connection.ts`) uses a global `__prismPool` to survive hot-reloads; PG pool timeouts all set to 30s

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
- `OPENAI_API_KEY` — chatbot model fixed to `gpt-5`
- Power BI: `POWERBI_CLIENT_ID`, `POWERBI_CLIENT_SECRET`, `POWERBI_TENANT_ID`, `POWERBI_WORKSPACE_ID`, `POWERBI_REPORT_ID`, `POWERBI_EMBED_URL`, `POWERBI_DATASET_ID`
- SMTP for magic-link emails: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

## Notable quirks

- `npm run dev` uses webpack explicitly (`--webpack`) — not the default turbopack
- `package.json` overrides pin `postcss` to 8.5.10 and `esbuild` to 0.28.0
- shadcn/ui style is `radix-vega` (not default), with lucide icons
- `npm run deploy-dev` rebuilds locally, pushes to `main`, then drops/recreates DB on server — **development-only**
- `npm run git-push` auto-generates chatbot prompt, builds, stages all, commits, and pushes — run instead of manual push
- `.github/copilot-instructions.md` exists with generic guidance — `AGENTS.md` supersedes it for OpenCode
