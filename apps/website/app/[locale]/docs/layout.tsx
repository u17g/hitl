import { setRequestLocale } from "next-intl/server";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { type Locale } from "@/i18n/routing";
import { getDocsNav, getDocTitle, getFlatDocPages } from "@/lib/docs";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const nav = getDocsNav();
  const titles = Object.fromEntries(
    getFlatDocPages().map((page) => [
      page.slug,
      getDocTitle(page.slug, locale as Locale),
    ]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-y-contain lg:pb-4">
          <DocsSidebar nav={nav} titles={titles} />
        </aside>
        <article className="min-w-0">{children}</article>
      </div>
    </div>
  );
}
