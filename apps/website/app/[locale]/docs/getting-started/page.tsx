import { getTranslations, setRequestLocale } from "next-intl/server";
import { CodeBlock } from "@/components/docs/code-block";
import { DocPager } from "@/components/docs/doc-pager";
import { snippets } from "@/lib/snippets";

export default async function GettingStartedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs.gettingStarted");

  return (
    <div className="prose-custom space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("prereqTitle")}</h2>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>{t("prereq1")}</li>
          <li>{t("prereq2")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("runTitle")}</h2>
        <p className="text-muted-foreground">{t("runDesc")}</p>
        <CodeBlock code={snippets.helloWorldRun} filename="terminal" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("tryTitle")}</h2>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>{t("try1")}</li>
          <li>{t("try2")}</li>
          <li>{t("try3")}</li>
        </ol>
      </section>

      <DocPager locale={locale} slug="getting-started" />
    </div>
  );
}
