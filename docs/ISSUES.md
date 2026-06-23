# ISSUES.md — AI Improvements Backlog

## Dependency Graph

```
┌─ Issue 01 (PBI context leak) ─────────────────┐
├─ Issue 02 (Response persistence race) ─────────┤
├─ Issue 03 (Visualization extraction) ──────────┤  ← Start immediately (bugs)
├─ Issue 04 (Modularize tool registry) ──────────┤
├─ Issue 07 (Cost budget system) ────────────────┤
├─ Issue 09 (Audience register self-select) ─────┤
├─ Issue 10 (Model retry with backoff) ──────────┤
├─ Issue 11 (DAX query sanitization) ────────────┤
├─ Issue 12 (Durable rate limiting) ─────────────┘
│
├─ Issue 05 (Structured reasoning UI) ◄── Issue 04
├─ Issue 06 (Live tool progress) ◄── Issue 04
└─ Issue 08 (Prompt token reduction) ◄── Issue 04
```

## Issue Summary

| # | Slug | Type | Priority |
|---|---|---|---|
| 01 | pbi-context-leak | Bug | Critical |
| 02 | response-persistence-race | Bug | High |
| 03 | visualization-extraction | Bug | High |
| 04 | modularize-tool-registry | Prefactor | High |
| 05 | structured-reasoning-ui | Feature | Medium |
| 06 | live-tool-progress | Feature | Medium |
| 07 | cost-budget-system | Feature | High |
| 08 | prompt-token-reduction | Optimization | Medium |
| 09 | audience-register-self-select | Feature | Medium |
| 10 | model-retry-backoff | Resilience | High |
| 11 | dax-query-sanitization | Security | Critical |
| 12 | durable-rate-limiting | Reliability | High |

## Implementation Order

**Wave 1** (parallel — bugs + security):
- Issue 01: Fix PBI conversation context leak
- Issue 02: Fix response persistence race condition
- Issue 03: Robust visualization extraction
- Issue 11: DAX query sanitization

**Wave 2** (parallel — prefactor + independent features):
- Issue 04: Modularize tool registry
- Issue 07: Cost budget system
- Issue 10: Model-level retry with backoff
- Issue 12: Durable rate limiting

**Wave 3** (dependent on #04):
- Issue 05: Structured reasoning steps in UI
- Issue 06: Live tool progress in thinking dropdown
- Issue 08: System prompt token reduction

**Wave 4** (independent — UX polish):
- Issue 09: Audience register self-select UI
