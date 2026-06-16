import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { type InlineTranslations } from "@/i18n/inline-translation";
import { type Locale } from "@/i18n/routing";
import { getDocSource } from "@/lib/docs-content";

const NAV_PATH = path.join(process.cwd(), "content", "docs.yaml");

export type DocNavPage = {
  slug: string;
  title?: InlineTranslations;
};

export type DocNavGroup = {
  group?: InlineTranslations;
  pages: DocNavPage[];
};

export type DocNavItem = DocNavPage | DocNavGroup;

function isNavGroup(item: DocNavItem): item is DocNavGroup {
  return "pages" in item;
}

function normalizePage(entry: string | DocNavPage): DocNavPage {
  if (typeof entry === "string") return { slug: entry };
  if (!entry.slug) {
    throw new Error("Nav page entry missing slug");
  }
  return entry;
}

function normalizeNavItem(
  entry: string | DocNavPage | DocNavGroup,
): DocNavItem {
  if (typeof entry === "string") {
    return { slug: entry };
  }
  if ("pages" in entry) {
    return {
      group: entry.group,
      pages: entry.pages.map(normalizePage),
    };
  }
  return normalizePage(entry);
}

function parseDocsNav(): DocNavItem[] {
  const raw = fs.readFileSync(NAV_PATH, "utf8");
  const config = parseYaml(raw) as {
    navigation?: Array<string | DocNavPage | DocNavGroup>;
  };

  if (!config.navigation?.length) {
    throw new Error(`Missing navigation in ${NAV_PATH}`);
  }

  return config.navigation.map(normalizeNavItem);
}

let cachedNav: DocNavItem[] | null = null;

export function getDocsNav(): DocNavItem[] {
  if (process.env.NODE_ENV === "production" && cachedNav) {
    return cachedNav;
  }

  const nav = parseDocsNav();
  if (process.env.NODE_ENV === "production") {
    cachedNav = nav;
  }
  return nav;
}

export function getFlatDocPages(): DocNavPage[] {
  const flat: DocNavPage[] = [];

  for (const item of getDocsNav()) {
    if (isNavGroup(item)) {
      flat.push(...item.pages);
    } else {
      flat.push(item);
    }
  }

  return flat;
}

export function getDocTitle(slug: string, locale: Locale): string {
  const navPage = getFlatDocPages().find((p) => p.slug === slug);
  if (navPage?.title) {
    return navPage.title[locale];
  }

  const doc = getDocSource(locale, slug);
  if (doc?.frontmatter.title) {
    return doc.frontmatter.title;
  }

  return slug;
}

export function getAdjacentDocs(slug: string) {
  const pages = getFlatDocPages();
  const index = pages.findIndex((p) => p.slug === slug);

  return {
    prev: index > 0 ? pages[index - 1] : undefined,
    next: index < pages.length - 1 ? pages[index + 1] : undefined,
  };
}
