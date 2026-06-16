"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useInlineTranslation, useLocale } from "@/i18n/use-inline-translation";

type DocPagerLink = {
  slug: string;
  title: string;
};

type DocPagerProps = {
  prev?: DocPagerLink;
  next?: DocPagerLink;
};

export function DocPager({ prev, next }: DocPagerProps) {
  const t = useInlineTranslation();
  const locale = useLocale();

  if (!prev && !next) return null;

  return (
    <div className="flex items-center justify-between border-t pt-8">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          locale={locale}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>
            {t({ en: "Previous", ja: "前へ" })}: {prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          locale={locale}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>
            {t({ en: "Next", ja: "次へ" })}: {next.title}
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
