import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/routing";
import { getAdjacentDocs, type DocSlug } from "@/lib/docs";
import { ArrowLeft, ArrowRight } from "lucide-react";

export async function DocPager({
  locale,
  slug,
}: {
  locale: string;
  slug: DocSlug;
}) {
  const t = await getTranslations("docs");
  const { prev, next } = getAdjacentDocs(slug);
  const loc = locale as Locale;

  if (!prev && !next) return null;

  return (
    <div className="flex items-center justify-between border-t pt-8">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          locale={loc}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>
            {t("prev")}: {t(prev.titleKey)}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          locale={loc}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>
            {t("next")}: {t(next.titleKey)}
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
