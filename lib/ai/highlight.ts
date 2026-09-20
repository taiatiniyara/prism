import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);

export function highlightCode(code: string, lang: string): { html: string; recognized: boolean } {
  const normalized = lang.toLowerCase().trim();

  if (normalized && hljs.getLanguage(normalized)) {
    try {
      const result = hljs.highlight(code, { language: normalized, ignoreIllegals: true });
      return { html: result.value, recognized: true };
    } catch {
      return { html: escapeHtml(code), recognized: false };
    }
  }

  if (!normalized) {
    try {
      const result = hljs.highlightAuto(code);
      return { html: result.value, recognized: false };
    } catch {
      return { html: escapeHtml(code), recognized: false };
    }
  }

  // An explicit but unregistered language (e.g. "plaintext", "diff") — don't
  // guess, just render the escaped text as-is.
  return { html: escapeHtml(code), recognized: false };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
