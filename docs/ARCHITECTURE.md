# ARCHITECTURE.md — PRISM Stack & Topology

Decisions recorded here, with rationale. Superseded decisions go in `docs/adr/`.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5 (strict) | Full-stack type safety; same language across client, server, DB |
| Framework | Next.js 16 (App Router) | Server components, API routes, middleware in one project; active PPA developer base familiar with React |
| Bundler | Webpack (`--webpack`) | Explicit choice over Turbopack for stability |
| UI | React 19, Tailwind CSS 4 | Current stable; utility-first CSS |
| Component library | shadcn/ui (radix-vega style) + Radix primitives + lucide icons | Accessible, composable; no runtime CSS-in-JS cost |
| Charts | ECharts + Recharts | ECharts for Power BI parity; Recharts for simple dashboards |
| Flow diagrams | @xyflow/react | BSC Strategy Map drag-and-drop node editor |
| Spreadsheets | ExcelJS | KPI data export to Excel |

## Data Store

| Concern | Choice | Rationale |
|---|---|---|
| Database | PostgreSQL (pg + Drizzle ORM) | Relational integrity for 47-table domain model; Drizzle for type-safe queries + schema-as-code |
| Migrations | `drizzle-kit push` (safe wrapper via `db-push-safe`) | Push-based schema sync with UUID timestamp fix pre-flight |
| Connection pooling | Single pool on `globalThis.__prismPool` (PG with 30s timeouts) | Survives Next.js hot-reload dev loop |
| Data architecture | Medallion: Bronze (typed `data_entries`, 10-dimension address, All-member convention) → Silver (`silver.data_entries_enriched`) → Gold (`gold.fact_kpi`, `fact_kpi_rollup`, `v_reporting_status`, `v_bsc_alignment`, `ext_*`) | One semantic source; gold owns all aggregation; AI/dashboards/reports read silver/gold only. Spec: `docs/schema-redesign-medallion.md`; builder guides: `docs/database-build-spec.md`, `docs/data-entries-configuration-guide.md` |

## Auth

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Better Auth v1.6 + Drizzle adapter | Email/password + magic link; built-in session management, rate limiting |
| Rate limiting | 100 requests / 15 min on auth endpoints | Brute-force protection |
| Route protection | Custom `proxy.ts` middleware (not Next.js middleware.ts) | Session lookup, role gating, email verification redirect; 7 protected path groups |
| Roles | 9 roles (DEV, BMO, BLO, CEO, EXE, DAOF, DAOH, DAOO, MGR, EXT) + EXT stakeholder_type self-ID | Role-based route access + sidebar visibility + AI audience register |
| Sessions | 24-hour cookie-based | Standard Better Auth defaults |

## AI

| Concern | Choice | Rationale |
|---|---|---|
| Provider | Anthropic Claude (Sonnet 4.6 primary, Haiku 4.5 fallback) | Best-in-class reasoning for domain-specific analysis |
| SDK | Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic`) | Streaming, tool calling, structured output |
| Tools | 67 (38 PRISM-native + 29 Power BI domain) | Hybrid architecture: Power BI for analytics, PRISM-native for diagnostics |
| Data priority | Power BI first → PRISM fallback → gap report | Power BI has richer historical data; PRISM-native covers what Power BI doesn't |
| Streaming | SSE + requestAnimationFrame character reveal | Smooth UX with collapsible reasoning chain |
| Rate limit | 20 req/min, 100 req/15min (configurable) | In-memory rate limiter; usage persisted to DB |
| Prompt version | `2026-06-18` | Versioned for auditability |

## Power BI

| Concern | Choice | Rationale |
|---|---|---|
| Auth | Azure AD service principal (client credentials) | Programmatic, no user interaction; requires Power BI Pro/PPU + Fabric F2 capacity |
| Embedding | powerbi-client + powerbi-client-react | Dashboard embedding in settings pages |
| Queries | DAX via REST API (`/api/getAzureAccessToken` token) | 55 pre-built templates + ad-hoc DAX |
| Schema | 19 tables covering reliability, generation, distribution, financials, customers, workforce, safety, fuel, climate, islands, tariffs, renewables, governance, leadership, transmission, air connectivity | Full utility benchmarking domain |
| RLS | Optional `POWERBI_EFFECTIVE_IDENTITY_UPN` / `ROLES` | Row-level security for multi-tenant datasets |

## Deployment

| Concern | Choice | Rationale |
|---|---|---|
| Target | VPS (156.67.221.57) | Full control over Node.js runtime + PostgreSQL; no serverless cold starts |
| Process manager | PM2 (`prism-v2`) | Zero-downtime reloads, log management, auto-restart |
| Runtime | Node.js 20+ via NVM | Matches Next.js 16 requirements |
| Build | Local `npm run build` → push to GitHub → SSH pull → `npm ci` → `npm run db-push` → `npm run build` → PM2 restart | Simple, auditable; no CI/CD complexity needed for single-VPS setup |
| Port | 3555 (prod) / 3554 (dev) | Chosen to avoid collisions |
| Cron | `node-cron` via `instrumentation.ts` (nodejs runtime, prod-only) | Singleton email schedule execution via PostgreSQL advisory locks; no external scheduler dependency |
| Backup | `pg_dump` before each deploy | Scripted in `scripts/deploy.sh` |

## Network Topology

```
Browser ──HTTPS──▶ VPS (Nginx reverse proxy)
                      ├── :3555 → Next.js (PM2)
                      │              ├── PostgreSQL (localhost)
                      │              ├── Anthropic API (api.anthropic.com)
                      │              ├── Power BI REST API (api.powerbi.com)
                      │              ├── Azure AD (login.microsoftonline.com)
                      │              ├── SMTP server (email)
                      │              └── World Bank API (api.worldbank.org)
                      └── Static assets
```

## API Contracts

- **/api/auth/[...all]** — Better Auth handler (all auth methods)
- **/api/ai/chat** — POST, SSE streaming, AI chat with tool tracking
- **/api/ai/sessions** — GET/POST session management
- **/api/ai/feedback** — POST user feedback
- **/api/data-entry/*** — data entry, review, KPI worker, BSC, custom KPI
- **/api/users**, **/api/settings/users/*** — user management
- **/api/context/organisation** — GET current user's org context
- **/api/fact***, **/api/dim*** — legacy training platform parity (API-key gated)
- **/api/migration/*** — data migration endpoints
- **/api/getAzureAccessToken** — Power BI token
- **/api/webhooks/email/replies** — inbound email
- **/api/cron/email-schedules** — trigger email schedules (API-key gated)

## Key Design Decisions

1. **No Docker** — single VPS deployment with PM2. Simpler maintenance for a small team; Nginx handles reverse proxy.
2. **No CI/CD pipeline** — manual deploy script. Acceptable given single-maintainer context; can add later per Feature Loop.
3. **No microservices** — monolithic Next.js app. Domain complexity is in the data model, not in throughput. Single process simplifies auth, logging, and transactions.
4. **Proxy middleware (not Next.js middleware.ts)** — custom `proxy.ts` reads the DB for role checks. Next.js edge middleware can't access `pg` directly. Acceptable trade-off for a low-traffic internal platform.
5. **Drizzle ORM over Prisma** — lighter weight, better TypeScript inference, no code generation step. Push-based migrations acceptable for dev velocity.
6. **Power BI as primary AI data source** — richer historical data and pre-built analytics vs. rebuilding everything in PRISM-native. Fallback architecture encapsulates the integration.
