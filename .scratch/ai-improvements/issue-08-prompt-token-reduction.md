# System Prompt Token Reduction

## What to build

The static system prompt is ~4K tokens, of which ~70 lines are Power BI domain documentation (table schemas, query categories, tool descriptions) that duplicate information already available in tool descriptions. Every conversation turn pays for these tokens in the input budget, leaving less room for conversation history and context.

Move Power BI domain documentation from the system prompt into individual tool descriptions. Remove the domain overview section from the prompt and let the model discover capabilities through tool descriptions at runtime. Target a 20%+ reduction in prompt tokens with no measurable quality regression.

## Acceptance criteria

- [ ] Power BI domain overview (lines ~84-153 of `prompt.ts`) removed from system prompt
- [ ] Any capability descriptions moved to `description` fields of relevant `pbi_*` tool definitions
- [ ] System prompt token count reduced by at least 20% (measured by tokenizer estimate)
- [ ] AI response quality benchmark: same 10 test queries produce equivalent quality responses before/after
- [ ] The 5-step reasoning chain and opinion-safety protocol remain intact in the prompt
- [ ] No regression in tool call accuracy — the AI still selects the right Power BI tools for queries

## Blocked by

- Issue 4 (Modularize tool registry) — tool descriptions need to be accessible for modification
