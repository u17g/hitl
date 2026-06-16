import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { type Locale } from "@/i18n/routing";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export type DocFrontmatter = {
  title: string;
  description?: string;
};

export type DocSource = {
  slug: string;
  content: string;
  frontmatter: DocFrontmatter;
  locale: Locale;
};

function slugFromPath(filePath: string, docsDir: string): string {
  const relative = path.relative(docsDir, filePath);
  return relative.replace(/\.mdx$/, "").replace(/\\/g, "/");
}

function resolveDocPath(locale: Locale, slug: string): string | null {
  const localized = path.join(CONTENT_ROOT, locale, "docs", `${slug}.mdx`);
  if (fs.existsSync(localized)) return localized;

  if (locale !== "en") {
    const fallback = path.join(CONTENT_ROOT, "en", "docs", `${slug}.mdx`);
    if (fs.existsSync(fallback)) return fallback;
  }

  return null;
}

export function getDocSource(locale: Locale, slug: string): DocSource | null {
  const filePath = resolveDocPath(locale, slug);
  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { content, data } = matter(raw);
  const frontmatter = data as DocFrontmatter;

  if (!frontmatter.title) {
    throw new Error(`Missing title in frontmatter: ${filePath}`);
  }

  const localizedRoot = path.join(CONTENT_ROOT, locale, "docs");
  const contentLocale: Locale = filePath.startsWith(localizedRoot)
    ? locale
    : "en";

  return {
    slug,
    content,
    frontmatter,
    locale: contentLocale,
  };
}

export function getAllDocSlugs(): string[] {
  const docsDir = path.join(CONTENT_ROOT, "en", "docs");
  if (!fs.existsSync(docsDir)) return [];

  const slugs: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".mdx")) {
        slugs.push(slugFromPath(fullPath, docsDir));
      }
    }
  }

  walk(docsDir);
  return slugs;
}
