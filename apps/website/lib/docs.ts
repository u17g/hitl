import { type Locale } from "@/i18n/routing";

export const docPages = [
  { slug: "getting-started", titleKey: "gettingStarted.title" },
  { slug: "installation", titleKey: "installation.title" },
  { slug: "channels", titleKey: "channels.title" },
  { slug: "workflow-devkit", titleKey: "workflowDevkit.title" },
] as const;

export type DocSlug = (typeof docPages)[number]["slug"];

export function docHref(locale: Locale, slug: DocSlug) {
  return `/${locale}/docs/${slug}`;
}

export function getAdjacentDocs(slug: DocSlug) {
  const index = docPages.findIndex((p) => p.slug === slug);
  return {
    prev: index > 0 ? docPages[index - 1] : undefined,
    next: index < docPages.length - 1 ? docPages[index + 1] : undefined,
  };
}
