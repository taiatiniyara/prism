import { describe, it, expect } from "vitest";

interface AiVisualization {
  type: string;
  title?: string;
  data?: unknown;
  [key: string]: unknown;
}

function extractVisualizations(content: string): AiVisualization[] {
  const visualizations: AiVisualization[] = [];
  const MAX_VIZ_COUNT = 5;
  const MAX_JSON_SIZE = 50_000;

  const blocks: string[] = [];

  // 1. Fenced code blocks with language tag
  let depth = 0;
  let currentBlock = "";
  let inBlock = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (content.slice(i, i + 3) === "```" && !inBlock) {
      if (depth === 0) {
        inBlock = true;
        currentBlock = "";
        let j = i + 3;
        while (j < content.length && content[j] !== "\n" && content[j] !== "\r") {
          j++;
        }
        i = j;
        continue;
      }
      depth++;
    }

    if (content.slice(i, i + 3) === "```" && inBlock) {
      if (depth === 0) {
        blocks.push(currentBlock);
        inBlock = false;
        i += 2;
        continue;
      }
      depth--;
    }

    if (inBlock) {
      currentBlock += ch;
    }
  }

  // 2. Try to parse each block as JSON, regardless of language tag
  for (const block of blocks) {
    if (visualizations.length >= MAX_VIZ_COUNT) break;
    if (block.length > MAX_JSON_SIZE) continue;

    const trimmed = block.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.type === "string") {
        visualizations.push(parsed as AiVisualization);
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  // 3. Fallback: search for inline JSON objects in the raw content
  if (visualizations.length === 0) {
    const jsonObjectRegex = /\{[\s\S]*?"type"\s*:\s*"(bar-chart|line-chart|table|leaderboard|scatter|radar|sankey|heatmap)"[\s\S]*?\}/g;
    let match;
    while ((match = jsonObjectRegex.exec(content)) !== null) {
      if (visualizations.length >= MAX_VIZ_COUNT) break;
      if (match[0].length > MAX_JSON_SIZE) continue;
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed.type === "string") {
          visualizations.push(parsed as AiVisualization);
        }
      } catch {
        // skip
      }
    }
  }

  return visualizations;
}

describe("Visualization extraction", () => {
  describe("fenced code blocks", () => {
    it("extracts JSON from ```json blocks", () => {
      const content = 'Here is a chart:\n\n```json\n{"type": "bar-chart", "title": "SAIDI Trend"}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("bar-chart");
      expect(result[0].title).toBe("SAIDI Trend");
    });

    it("extracts JSON from ``` ``` blocks (no language tag)", () => {
      const content = '```\n{"type": "line-chart", "title": "Trend"}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("line-chart");
    });

    it("extracts JSON from ```javascript blocks", () => {
      const content = '```javascript\n{"type": "leaderboard", "title": "Rankings"}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("leaderboard");
    });

    it("extracts JSON from ```jsonc blocks", () => {
      const content = '```jsonc\n{"type": "table", "title": "Data"}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("table");
    });
  });

  describe("nested and unusual formatting", () => {
    it("extracts visualization with markdown inside response", () => {
      const content = `Here's the analysis:

\`\`\`json
{"type": "sankey", "title": "Energy Flow", "data": {"nodes": [], "links": []}}
\`\`\`

Followed by more text.`;
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("sankey");
    });

    it("extracts multiple visualizations", () => {
      const content = `\`\`\`json
{"type": "bar-chart", "title": "First"}
\`\`\`
Some text
\`\`\`json
{"type": "line-chart", "title": "Second"}
\`\`\``;
      const result = extractVisualizations(content);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("First");
      expect(result[1].title).toBe("Second");
    });

    it("caps at 5 visualizations", () => {
      const viz = '{"type": "bar-chart", "title": "T"}';
      const content = Array.from({ length: 10 }, () => `\`\`\`json\n${viz}\n\`\`\``).join("\n");
      const result = extractVisualizations(content);
      expect(result).toHaveLength(5);
    });
  });

  describe("inline JSON fallback", () => {
    it("extracts inline JSON objects with type field", () => {
      const content = 'Here is {"type": "scatter", "title": "Correlation", "data": [1,2,3]}.';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("scatter");
    });

    it("extracts inline JSON in long text", () => {
      const content = `Based on the analysis, here's the result: {"type": "radar", "title": "Utility Profile", "categories": ["SAIDI", "SAIFI", "Losses"], "values": [360, 10, 12]}. This shows performance across key metrics.`;
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("radar");
    });

    it("does not extract non-visualization JSON objects", () => {
      const content = '```json\n{"foo": "bar", "baz": 42}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for content with no visualizations", () => {
      const result = extractVisualizations("Just some text about utility performance.");
      expect(result).toEqual([]);
    });

    it("handles empty content", () => {
      const result = extractVisualizations("");
      expect(result).toEqual([]);
    });

    it("rejects JSON over 50KB", () => {
      const large = JSON.stringify({ type: "bar-chart", data: "x".repeat(49_990) });
      const content = `\`\`\`json\n${large}\n\`\`\``;
      const result = extractVisualizations(content);
      expect(result).toHaveLength(0);
    });

    it("skips malformed JSON gracefully", () => {
      const content = '```json\n{type: "bar-chart", broken json}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(0);
    });

    it("handles mixed markdown and code blocks", () => {
      const content = `Here's a chart:
\`\`\`json
{"type": "heatmap", "title": "Risk Matrix"}
\`\`\`
\`\`\`python
print("hello")
\`\`\`
More text here.`;
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("heatmap");
    });

    it("extracts visualization from ```js block", () => {
      const content = '```js\n{"type": "bar-chart", "title": "JS block"}\n```';
      const result = extractVisualizations(content);
      expect(result).toHaveLength(1);
    });
  });
});
