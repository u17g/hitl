import { createHighlighter, type BundledLanguage } from "shiki";

const THEME = "github-dark";

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: ["typescript", "tsx", "shell"],
    });
  }
  return highlighterPromise;
}

const htmlCache = new Map<string, string>();

export async function highlightCode(code: string, lang: BundledLanguage) {
  const cacheKey = `${lang}:${code}`;
  const cached = htmlCache.get(cacheKey);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  const html = highlighter.codeToHtml(code, {
    lang,
    theme: THEME,
  });
  htmlCache.set(cacheKey, html);
  return html;
}

export function inferLang(filename?: string): BundledLanguage {
  if (!filename) return "typescript";

  const normalized = filename.toLowerCase();
  if (normalized === "terminal" || normalized === "bash") return "shell";
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "typescript";

  return "typescript";
}

const PLAIN_FENCE_LANGS = new Set(["text", "plaintext", "plain"]);

export function isPlainFenceLang(lang: string): boolean {
  return PLAIN_FENCE_LANGS.has(lang.toLowerCase());
}

export function fenceLangToShiki(lang: string): BundledLanguage {
  const normalized = lang.toLowerCase();
  if (normalized === "bash" || normalized === "sh" || normalized === "shell") {
    return "shell";
  }
  if (normalized === "tsx") return "tsx";
  if (normalized === "typescript" || normalized === "ts") return "typescript";
  return "typescript";
}
