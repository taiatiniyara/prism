# ISSUES.md — Dev Observability Backlog

Feature: `dev-observability`
Created: 2026-06-24

## Dependency Graph

```
 Phase 1 (no dependencies — start immediately)
 ├── #1  Health Check Endpoint
 ├── #2  Environment & Config Viewer
 ├── #4  Error Log Viewer
 ├── #5  Audit Log Viewer
 ├── #8  Data Entry Pipeline Health
 ├── #9  KPI Calculation Monitor
 ├── #10 Security & Auth Dashboard
 ├── #11 Backup & Data Integrity Monitor
 ├── #12 System Log Persistence + Viewer
 │
 Phase 2
 ├── #3  Deployment Info & Smoke Test         ← needs #1
 ├── #6  AI Usage & Cost Dashboard             ← no deps (but logically after Phase 1)
 │
 Phase 3
 ├── #7  Cost & Budget Monitor                 ← needs #6
 │
 Phase 4
 ├── #13 Admin Overview Dashboard              ← needs #1, #4, #6, #9, #10, #11
 │
 Phase 5
 └── #14 Alerting Rules Engine                ← needs #1, #4, #7, #10, #11
```

## Issues

| # | Issue | Effort | Depends On |
|---|---|---|---|
| 1 | [Health Check Endpoint](.scratch/dev-observability/issue-1-health-check-endpoint.md) | S | — |
| 2 | [Environment & Config Viewer](.scratch/dev-observability/issue-2-env-config-viewer.md) | S | — |
| 3 | [Deployment Info & Smoke Test](.scratch/dev-observability/issue-3-deployment-info-smoke-test.md) | S | #1 |
| 4 | [Error Log Viewer](.scratch/dev-observability/issue-4-error-log-viewer.md) | M | — |
| 5 | [Audit Log Viewer](.scratch/dev-observability/issue-5-audit-log-viewer.md) | S | — |
| 6 | [AI Usage & Cost Dashboard](.scratch/dev-observability/issue-6-ai-usage-dashboard.md) | M | — |
| 7 | [Cost & Budget Monitor](.scratch/dev-observability/issue-7-cost-budget-monitor.md) | M | #6 |
| 8 | [Data Entry Pipeline Health](.scratch/dev-observability/issue-8-data-entry-pipeline-health.md) | M | — |
| 9 | [KPI Calculation Monitor](.scratch/dev-observability/issue-9-kpi-calculation-monitor.md) | S | — |
| 10 | [Security & Auth Dashboard](.scratch/dev-observability/issue-10-security-auth-dashboard.md) | M | — |
| 11 | [Backup & Data Integrity Monitor](.scratch/dev-observability/issue-11-backup-data-integrity-monitor.md) | M | — |
| 12 | [System Log Persistence + Viewer](.scratch/dev-observability/issue-12-system-log-persistence-viewer.md) | M | — |
| 13 | [Admin Overview Dashboard](.scratch/dev-observability/issue-13-admin-overview-dashboard.md) | M | #1, #4, #6, #9, #10, #11 |
| 14 | [Alerting Rules Engine](.scratch/dev-observability/issue-14-alerting-rules-engine.md) | L | #1, #4, #7, #10, #11 |
