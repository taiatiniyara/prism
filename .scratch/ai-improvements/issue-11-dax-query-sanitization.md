# DAX Query Sanitization

## What to build

DAX queries built from user-facing AI tools are sent directly to the Power BI REST API without validation. A malicious or confused AI could construct DAX containing DDL (`CREATE`, `ALTER`, `DROP`, `REFRESH`), DML (`EVALUATE` with side effects), or information-schema queries that expose internal dataset structure beyond the schema registry.

Add a DAX validation layer that whitelist-validates every query before it reaches the Power BI API. Block dangerous patterns, limit result size, and enforce query timeouts.

## Acceptance criteria

- [ ] All DAX queries pass through a `sanitizeDax()` function before execution
- [ ] Blocked patterns: `CREATE`, `ALTER`, `DROP`, `REFRESH`, `DELETE`, `UPDATE`, `INFO.*` schema discovery functions
- [ ] Only allowed top-level statements: `EVALUATE`, `SUMMARIZECOLUMNS`, `DEFINE`
- [ ] `ORDER BY` removed if row count exceeds sensical limit (defense against unbounded sorts)
- [ ] Query length capped at 8KB (reject oversized queries)
- [ ] Rejected queries return a structured error: `{ blocked: true, reason: "...", pattern: "..." }`
- [ ] Valid queries from the 55 pre-built templates all pass sanitization
- [ ] Test: 20 known-dangerous DAX patterns (DDL, DML, info schema, sub-select injection) all rejected
- [ ] Test: all 55 pre-built template queries pass validation

## Blocked by

None — can start immediately.
