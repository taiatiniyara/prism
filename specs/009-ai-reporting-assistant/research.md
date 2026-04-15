# Research: AI Reporting Assistant for PRISM

## Decision 1: Server-side intent routing over existing read-only PRISM services

- Decision: Route user prompts to existing read-only internal service functions
  through a server-side intent router.
- Rationale: Aligns with clarified scope (phase one permits existing read-only
  services), preserves existing authorization boundaries, and avoids introducing
  unrestricted SQL risk.
- Alternatives considered: Model-generated SQL execution (rejected: elevated
  security risk and higher validation complexity); separate analytics
  microservice (rejected: unnecessary architecture expansion for MVP).

## Decision 2: Launch access roles are DEV, BMO, BLO, and CEO only

- Decision: Restrict AI feature access at launch to DEV, BMO, BLO, and CEO
  roles.
- Rationale: Matches clarified requirement while balancing pilot reach and
  access-control risk.
- Alternatives considered: DEV/BMO only (rejected: insufficient operational
  pilot coverage); all authenticated roles (rejected: broad exposure before
  governance confidence is established).

## Decision 3: Structured AI response envelope with source attribution

- Decision: Standardize API responses to include summary, metrics, rows,
  attribution metadata, and export descriptors.
- Rationale: Enables consistent UI rendering, testable contracts, and
  transparent data provenance.
- Alternatives considered: Free-form markdown output only (rejected: hard to
  validate and render consistently); per-intent custom payloads (rejected: high
  coupling and maintenance overhead).

## Decision 4: Mandatory PDF and CSV export in MVP

- Decision: Provide user-triggered PDF and CSV export generation as part of MVP.
- Rationale: Clarified requirement and direct business value for report
  distribution workflows.
- Alternatives considered: Export-ready payload only (rejected by
  clarification); CSV-only MVP (rejected: insufficient parity with business
  reporting needs).

## Decision 5: Human review gate before external narrative sharing

- Decision: Require explicit human approval before externally sharing
  AI-generated narrative reports.
- Rationale: Reduces external communication risk and supports quality/governance
  controls.
- Alternatives considered: Optional review (rejected: inconsistent governance);
  no review requirement (rejected: unacceptable reputational/compliance risk).

## Decision 6: AI execution trace retention at 90 days

- Decision: Retain AI execution traces for 90 days with authorized admin review
  access.
- Rationale: Satisfies clarified requirement and supports incident analysis
  without indefinite retention burden.
- Alternatives considered: 30-day retention (rejected: limited forensic depth);
  365+ days or indefinite retention (rejected: unnecessary storage/compliance
  overhead for MVP).

## Decision 7: Follow-up context support via explicit session context object

- Decision: Support follow-up prompts only when an explicit session context
  payload is provided.
- Rationale: Keeps behavior deterministic and auditable while enabling
  conversational continuity.
- Alternatives considered: Implicit long-lived context state (rejected: less
  predictable, harder to audit); no follow-up support (rejected: conflicts with
  functional requirements).

## Decision 8: Guardrails enforced centrally in AI service layer

- Decision: Enforce row limits, timeout thresholds, forbidden operation checks,
  and safe error shaping in a shared AI service layer.
- Rationale: Centralized policy avoids duplicated logic and ensures consistent
  enforcement across endpoints.
- Alternatives considered: Per-route bespoke guardrails (rejected: drift risk);
  client-side guardrails (rejected: violates server-first security principle).

## Decision 9: Vercel AI SDK with GPT-5 primary and GPT-5-mini fallback

- Decision: Use Vercel AI SDK (`ai`) with OpenAI provider, GPT-5 as the primary
  model, and GPT-5-mini as the fallback model.
- Rationale: Fits the existing Next.js architecture, supports structured outputs
  and tool-based orchestration, and balances quality with cost and resilience
  for degraded-mode execution.
- Alternatives considered: Direct provider SDK integration without Vercel AI SDK
  (rejected: higher integration overhead and less standardized tool/output
  handling); single-model strategy only (rejected: reduced operational
  flexibility for cost and latency management).
