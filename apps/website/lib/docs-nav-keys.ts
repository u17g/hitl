import type { InlineTranslations } from "@/i18n/inline-translation";

export type DocNavPageKeyInput = {
  slug: string;
  title?: InlineTranslations;
};

export function navPageKey(page: DocNavPageKeyInput): string {
  if (page.title?.en) return `${page.slug}::${page.title.en}`;
  return page.slug;
}
