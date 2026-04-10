# prism Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-10

## Active Technologies
- TypeScript (strict), React 19.2.3, Next.js 16.1.1 + Next App Router, Drizzle ORM, `pg`, Tailwind CSS, (005-review-kpi-values)
- PostgreSQL via Drizzle schema (`data_entries`, `input_definitions`, (005-review-kpi-values)
- TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 + Next.js App Router, Drizzle ORM, pg, Tailwind CSS 4, (006-kpi-balanced-scorecard)
- PostgreSQL via Drizzle schema under `db/schema` (006-kpi-balanced-scorecard)
- TypeScript 5.x, React 19.2.3, Next.js 16.1.1 (App + better-auth, drizzle-orm, pg, Next.js server (007-pending-user-activation)
- PostgreSQL via Drizzle ORM schema in `db/schema` (007-pending-user-activation)
- TypeScript (strict mode), React 19.2.3, Next.js 16.1.1 + Next.js App Router, Drizzle ORM, pg, better-auth, nodemailer, Tailwind CSS, shadcn-style UI primitives, zod-style validator pattern already used in route `_lib/validators` modules (008-review-custom-kpi)
- PostgreSQL via Drizzle ORM (`db/schema/*.ts`, `db/config.ts`) (008-review-custom-kpi)

- TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App Router + Next.js
  server actions/API routes, Drizzle ORM, pg, better-auth, Tailwind CSS,
  shadcn-compatible UI primitives (002-aggregated-formula-worker)
- PostgreSQL via Drizzle schema modules in `db/schema/*`
  (002-aggregated-formula-worker)
- TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App + Next.js server
  routes/actions, Drizzle ORM, pg, (003-kpi-worker-calculation)
- PostgreSQL via Drizzle schema modules (`db/schema/*`)
  (003-kpi-worker-calculation)
- TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App + Next.js route
  handlers/server actions, Drizzle ORM, (004-review-kpi-ui)
- PostgreSQL via Drizzle schema modules under `db/schema/*` (004-review-kpi-ui)
- TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App Router + Next.js
  route handlers/server components, Drizzle ORM, pg, better-auth, nodemailer,
  Tailwind CSS, shadcn-compatible UI primitives (004-review-kpi-ui)

- TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App + Next.js, React,
  Drizzle ORM, pg, better-auth, Tailwind (001-data-entry-filters)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 App: Follow standard
conventions

## Recent Changes
- 008-review-custom-kpi: Added TypeScript (strict mode), React 19.2.3, Next.js 16.1.1 + Next.js App Router, Drizzle ORM, pg, better-auth, nodemailer, Tailwind CSS, shadcn-style UI primitives, zod-style validator pattern already used in route `_lib/validators` modules
- 007-pending-user-activation: Added TypeScript 5.x, React 19.2.3, Next.js 16.1.1 (App + better-auth, drizzle-orm, pg, Next.js server
- 006-kpi-balanced-scorecard: Added TypeScript 5.x (strict), React 19.2.3, Next.js 16.1.1 + Next.js App Router, Drizzle ORM, pg, Tailwind CSS 4,

  App Router + Next.js route handlers/server components, Drizzle ORM, pg,
  better-auth, nodemailer, Tailwind CSS, shadcn-compatible UI primitives
  App + Next.js route handlers/server actions, Drizzle ORM,

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
