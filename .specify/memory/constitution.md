<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles:
	- V. Consistent, Accessible User Experience -> V. Design System Consistency and Reuse
- Added sections:
	- None
- Removed sections:
	- None
- Templates requiring updates:
	- .specify/templates/plan-template.md: ✅ updated
	- .specify/templates/spec-template.md: ✅ updated
	- .specify/templates/tasks-template.md: ✅ updated
	- README.md: ✅ already aligned
	- .specify/templates/commands/*.md: ⚠ pending (directory not present in this repository)
- Follow-up TODOs:
	- None
-->

# PRISM Constitution

## Core Principles

### I. Type-Safe, Server-First Architecture

All production code MUST be implemented in TypeScript with strict typing
maintained. Business rules, authorization checks, and data-write operations MUST
execute on the server via API routes or server-side services. Client components
MUST remain presentation-focused and MUST NOT contain security-critical or
data-integrity-critical decision logic. Rationale: server-centered and strongly
typed logic reduces runtime defects and security drift.

### II. Security and Access Control by Default

Every endpoint, settings mutation, and protected workflow MUST enforce
authentication and role-aware authorization before executing business logic.
Secrets MUST be sourced from environment variables and MUST NOT be hardcoded or
committed. Inputs from forms, files, and external systems MUST be validated and
sanitized before persistence or downstream use. Rationale: PRISM handles
organizational and reporting data that requires strict access controls.

### III. Data Integrity and Traceable Changes

Schema changes MUST be managed through Drizzle schema definitions and an
explicit update path (`db-push` or migration workflow) that is reviewed with the
feature change. Mutations MUST be idempotent where practical, and write paths
MUST preserve referential integrity. Any feature that changes reported values,
KPI calculations, or managed-list records MUST document its data impact in the
spec and tasks artifacts. Rationale: reporting correctness depends on
deterministic, reviewable data transformations.

### IV. Verifiable Quality Gates

Changes MUST pass lint and build checks before merge. Features that alter
business behavior, permissions, imports/exports, or data transformations MUST
include automated tests at the appropriate level (unit, integration, or
route-level contract tests). Bug fixes MUST include a regression test when
technically feasible. Pull requests MUST include evidence of validation commands
run and outcomes. Rationale: testable change evidence is required to maintain
reliability as the app grows.

### V. Design System Consistency and Reuse

All UI implementations MUST use Tailwind CSS utility patterns and shadcn-style
component primitives already established in the repository before introducing
custom UI structures. Reusable components MUST be extracted and shared when
behavior or visual patterns appear in more than one screen, flow, or module.
Forms and interactive controls MUST provide accessible labels, keyboard support,
and visible error states. Loading, empty, and failure states MUST be implemented
for all asynchronous views. User-facing copy MUST be clear and consistent with
the domain language used across dashboard, settings, and data-entry flows.
Rationale: design-system alignment and reuse reduce duplication, defects, and UI
inconsistency.

## Technical Standards

- Runtime and framework baseline MUST remain aligned to the active stack:
  Next.js App Router, React 19, TypeScript strict mode, and Drizzle ORM.
- UI implementation MUST use Tailwind CSS and shadcn-compatible component
  composition as the default approach for layout, styling, and interactive
  controls.
- API and service modules MUST keep a clear separation between transport
  concerns and domain logic so behavior can be tested independently.
- Repository imports SHOULD prefer stable aliases (`@/`) to reduce brittle
  relative paths.
- Operational scripts and deployment steps MUST be non-interactive and
  reproducible in CI.

## Development Workflow and Delivery Controls

- Feature work MUST begin with a specification that defines user scenarios, data
  impact, and measurable success criteria.
- Implementation plans MUST include an explicit Constitution Check and record
  any justified complexity deviations before development starts.
- Tasks MUST be organized by user story and include required validation tasks
  (lint/build and tests when behavior changes), plus reusable component
  extraction tasks for repeated UI patterns.
- Code review MUST verify: security controls, data integrity implications,
  accessibility, and validation evidence.
- Code review MUST reject duplicated UI implementations when a shared
  Tailwind/shadcn component can satisfy the requirement.

## Governance

This constitution overrides conflicting local conventions in planning and
implementation docs. Amendments require: (1) a documented rationale, (2)
explicit updates to impacted templates, and (3) approval from project
maintainers. Versioning policy for this document follows semantic versioning:
MAJOR for incompatible governance changes, MINOR for new principles or
materially expanded guidance, PATCH for clarifications that do not change
obligations. Compliance review is mandatory in every pull request via
constitution-aligned plan/spec/tasks artifacts and recorded validation outputs.

**Version**: 1.1.0 | **Ratified**: 2026-03-18 | **Last Amended**: 2026-03-18
