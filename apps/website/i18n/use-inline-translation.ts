"use client";

import { useLocale as useNextIntlLocale } from "next-intl";
import { createInlineTranslator } from "./inline-translation";
import { type Locale } from "./routing";

export type { InlineTranslations, Locale } from "./inline-translation";

export const useLocale = (): Locale => useNextIntlLocale() as Locale;

/**
 * @example
 * ```tsx
 * const t = useInlineTranslation();
 * <div>{t({ en: "Hello", ja: "こんにちは" })}</div>
 * ```
 */
export const useInlineTranslation = () => {
  const locale = useLocale();
  return createInlineTranslator(locale);
};
