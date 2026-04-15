# Data Model: AI Reporting Assistant for PRISM

## Entity: AiQueryRequest

- Purpose: Captures the incoming query intent and runtime context for one AI
  request.
- Fields:
  - requestId (string, UUID, required)
  - userId (string, required)
  - userRole (enum: DEV|BMO|BLO|CEO, required)
  - promptText (string, required, length > 0)
  - filterContext (json, optional)
  - sessionContextId (string, optional)
  - requestedAt (datetime, required)
- Validation rules:
  - userRole must be one of launch-allowed roles.
  - promptText must be non-empty after trimming.
  - filterContext keys must match approved report dimensions.

## Entity: AiExecutionTrace

- Purpose: Auditable record of AI execution lifecycle and guardrail outcomes.
- Fields:
  - traceId (string, UUID, required)
  - requestId (string, required, FK -> AiQueryRequest.requestId)
  - selectedTools (json array of tool identifiers, required)
  - latencyMs (number, required)
  - status (enum:
    SUCCESS|VALIDATION_ERROR|FORBIDDEN|TIMEOUT|PARTIAL_FAILURE|NO_DATA,
    required)
  - failureType (string, optional)
  - rowCountReturned (number, required, default 0)
  - retainedUntil (datetime, required, requestedAt + 90 days)
  - createdAt (datetime, required)
- Validation rules:
  - traceId unique.
  - status required and limited to enum values.
  - retainedUntil must be exactly 90 days from creation policy baseline.

## Entity: AiResponseEnvelope

- Purpose: Typed response object returned to UI and export surfaces.
- Fields:
  - traceId (string, required)
  - summary (string, required)
  - metrics (array of MetricItem, required)
  - rows (array of RowItem, required)
  - attribution (array of AttributionItem, required)
  - export (ExportDescriptor, required)
  - warnings (array of string, optional)
- Validation rules:
  - attribution entries required when metrics or rows are non-empty.
  - export must include both PDF and CSV availability for MVP.

## Entity: AiNarrativeReview

- Purpose: Controls external sharing gate for narrative outputs.
- Fields:
  - reviewId (string, UUID, required)
  - traceId (string, required, FK -> AiExecutionTrace.traceId)
  - reviewerUserId (string, required)
  - reviewerRole (enum: DEV|BMO, required)
  - decision (enum: APPROVED|REJECTED, required)
  - rationale (string, optional)
  - reviewedAt (datetime, required)
- Validation rules:
  - only DEV and BMO roles may create approval/rejection decisions.
  - external share action allowed only when latest decision is APPROVED.
  - decision changes must be auditable via timestamped records.

## Value Objects

### MetricItem

- label (string)
- value (string|number)
- unit (string, optional)

### RowItem

- columns (json object with approved scalar values)

### AttributionItem

- sourceName (string)
- sourceType (enum: SERVICE_FUNCTION|DATASET)
- sourceRef (string)

### ExportDescriptor

- pdfAvailable (boolean, must be true in MVP)
- csvAvailable (boolean, must be true in MVP)
- reportId (string, optional)

## Relationships

- AiQueryRequest 1:1 AiExecutionTrace (logical primary execution trace per
  handled request).
- AiExecutionTrace 1:N AiNarrativeReview (supports review history records).
- AiExecutionTrace 1:1 AiResponseEnvelope (captured response contract per
  trace).

## State Transitions

### Execution Status

- Requested -> Running -> SUCCESS
- Requested -> Running -> VALIDATION_ERROR
- Requested -> Running -> FORBIDDEN
- Requested -> Running -> TIMEOUT
- Requested -> Running -> PARTIAL_FAILURE
- Requested -> Running -> NO_DATA

### Narrative Review Gate

- Unreviewed -> APPROVED (external sharing enabled)
- Unreviewed -> REJECTED (external sharing blocked)
- REJECTED -> APPROVED (external sharing enabled after later approval)
- APPROVED -> REJECTED (external sharing blocked if latest decision is
  rejection)
