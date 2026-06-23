# Robust Visualization Extraction

## What to build

The `extractVisualizations` function in the message bubble component uses regex to find ` ```json ``` ` fenced code blocks. When the AI formats JSON slightly differently — missing backticks, using a different language tag (`javascript`, `jsonc`, no tag), or wrapping in markdown — the visualization is silently dropped and never rendered.

Replace regex-based extraction with a structured parser that handles common formatting variations and provides a fallback path.

## Acceptance criteria

- [ ] Visualizations render when JSON is in ` ```json ``` ` blocks (current behavior preserved)
- [ ] Visualizations render when JSON has no language tag (` ``` ``` `)
- [ ] Visualizations render when JSON is not fenced at all (raw JSON in the response)
- [ ] Visualizations render when JSON uses ` ```javascript ``` ` or ` ```jsonc ``` ` tags
- [ ] Extraction handles escaped content within markdown (nested code blocks, special chars)
- [ ] Malformed JSON is caught and reported as a parse error in the UI, not a silent drop
- [ ] Max limits enforced: 5 visualizations, 50KB JSON total

## Blocked by

None — can start immediately.
