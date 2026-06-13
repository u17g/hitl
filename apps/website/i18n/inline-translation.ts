import { type Locale } from "./routing";

export type { Locale };

export type InlineTranslations<Resource extends string = string> = {
  [L in Locale]: Resource;
};

export function createInlineTranslator(locale: Locale) {
  return <Resource extends string>(
    resources: InlineTranslations<Resource>,
  ): Resource => resources[locale];
}
