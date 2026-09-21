/**
 * Build a safe download filename (without extension) from a report title.
 *
 * Linear-time on purpose. The previous inline version trimmed leading/trailing
 * separators with `/^[._-]+|[._-]+$/g` and only `.slice(0, 100)`-capped the
 * result *afterwards*, so an unbounded, request-body-supplied title reached the
 * anchored `[._-]+$` alternation — which CodeQL flagged as a polynomial ReDoS
 * (js/polynomial-redos). This scans the ends by index instead, so no amount of
 * `.`/`_`/`-` padding can trigger super-linear backtracking.
 *
 * Output is byte-identical to the old pipeline for normal input:
 * collapse disallowed runs → `_`, strip leading/trailing `. _ -`, cap at 100,
 * falling back to "report" when nothing survives.
 */
export function safeReportFilename(title?: string | null): string {
  const collapsed = (title || "report").replace(/[^A-Za-z0-9._-]+/g, "_");
  const isTrimChar = (c: string): boolean =>
    c === "." || c === "_" || c === "-";
  let start = 0;
  let end = collapsed.length;
  while (start < end && isTrimChar(collapsed[start]!)) start++;
  while (end > start && isTrimChar(collapsed[end - 1]!)) end--;
  return collapsed.slice(start, end).slice(0, 100) || "report";
}
