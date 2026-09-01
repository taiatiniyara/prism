# Live Tool Progress in Thinking Dropdown

## What to build

When the AI calls tools, the only visibility users get is a post-execution `🔍 toolName...` / `✅ toolName done` text entry injected into the reasoning stream. There is no real-time indication of WHICH tool is currently executing, how long it's been running, or what it found.

Add a live tool progress system: stream tool-start events with the tool name as soon as execution begins, show an animated indicator in the thinking dropdown during execution, and stream tool-result summaries immediately upon completion.

## Acceptance criteria

- [ ] Server emits `tool:start` events to the SSE stream with tool name and start timestamp
- [ ] Server emits `tool:end` events with tool name, latency, and result summary (first 200 chars)
- [ ] Thinking dropdown shows "Running: get_kpi_status..." with an animated spinner during execution
- [ ] Each running tool is listed in the thinking dropdown with elapsed time counter
- [ ] Completed tools show green checkmark and collapse their result summary
- [ ] Errored tools show red X with error summary
- [ ] Tool events don't interfere with text streaming — both streams run concurrently
- [ ] Thinking dropdown auto-expands during tool execution even if collapsed

## Blocked by

- Issue 4 (Modularize tool registry) — tool event streaming hooks into the tool execution wrapper
