import { type InlineTranslations } from "@/i18n/inline-translation";
import { getPathname } from "@/i18n/navigation";
import { type Locale } from "@/i18n/routing";

export const docPages = [
  {
    slug: "getting-started",
    title: {
      en: "Getting Started",
      ja: "はじめに",
    },
  },
  {
    slug: "installation",
    title: {
      en: "Installation",
      ja: "インストール",
    },
  },
  {
    slug: "channels",
    title: {
      en: "Channels",
      ja: "チャネル",
    },
  },
  {
    slug: "workflow-devkit",
    title: {
      en: "Workflow DevKit",
      ja: "Workflow DevKit",
    },
  },
] as const satisfies ReadonlyArray<{
  slug: string;
  title: InlineTranslations;
}>;

export type DocSlug = (typeof docPages)[number]["slug"];

export function docHref(locale: Locale, slug: DocSlug) {
  return getPathname({ locale, href: `/docs/${slug}` });
}

export function getAdjacentDocs(slug: DocSlug) {
  const index = docPages.findIndex((p) => p.slug === slug);
  return {
    prev: index > 0 ? docPages[index - 1] : undefined,
    next: index < docPages.length - 1 ? docPages[index + 1] : undefined,
  };
}
