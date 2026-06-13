import { getTranslations, setRequestLocale } from "next-intl/server";
import { CodeBlock } from "@/components/docs/code-block";
import { DocPager } from "@/components/docs/doc-pager";
import { snippets } from "@/lib/snippets";

export default async function InstallationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs.installation");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("coreTitle")}</h2>
        <p className="text-muted-foreground">{t("coreDesc")}</p>
        <CodeBlock code={snippets.install} filename="terminal" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("adaptersTitle")}</h2>
        <p className="text-muted-foreground">{t("adaptersDesc")}</p>
        <CodeBlock code={snippets.installAdapters} filename="terminal" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("stateTitle")}</h2>
        <p className="text-muted-foreground">{t("stateDesc")}</p>
        <CodeBlock
          code={`npm install @hitl/state-sqlite\n# or\nnpm install @hitl/state-pg`}
          filename="terminal"
        />
      </section>

      <DocPager locale={locale} slug="installation" />
    </div>
  );
}
