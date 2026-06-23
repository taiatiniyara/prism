# Structured Reasoning Steps in UI

## What to build

The Energy Expert's 5-step reasoning chain (Diagnose → Connect → Position → Recommend → Caveat) exists only as prose in the system prompt. The AI produces it as narrative text, and the thinking dropdown renders it as a single block of markdown. Users cannot distinguish the steps, and the AI sometimes skips steps because there's no structured enforcement.

Update the system prompt to request labeled reasoning sections, parse the reasoning content into 5 named steps on the server, and render each step as an independently collapsible section in the thinking dropdown with descriptive labels and icons.

## Acceptance criteria

- [ ] System prompt updated to request structured reasoning with labeled sections
- [ ] Server parses reasoning content into `diagnose`, `connect`, `position`, `recommend`, `caveat` steps
- [ ] Thinking dropdown shows steps as labeled, collapsible sections (not raw text)
- [ ] Each step has a descriptive label and icon (e.g., magnifying glass for Diagnose)
- [ ] Steps can be collapsed/expanded independently
- [ ] AI responses without structured reasoning fall back to the current raw text display
- [ ] Tool process entries (🔍/✅ tool markers) still render alongside reasoning steps

## Blocked by

- Issue 4 (Modularize tool registry) — the prompt and tool descriptions are coupled in `tools/index.ts`
