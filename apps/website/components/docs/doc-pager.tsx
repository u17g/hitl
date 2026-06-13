"use client";

import { Link } from "@/i18n/navigation";
import { useInlineTranslation, useLocale } from "@/i18n/use-inline-translation";
import { getAdjacentDocs, type DocSlug } from "@/lib/docs";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function DocPager({ slug }: { slug: DocSlug }) {
  const t = useInlineTranslation();
  const locale = useLocale();
  const { prev, next } = getAdjacentDocs(slug);

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
            {t({ en: "Previous", ja: "前へ" })}: {t(prev.title)}
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
            {t({ en: "Next", ja: "次へ" })}: {t(next.title)}
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
