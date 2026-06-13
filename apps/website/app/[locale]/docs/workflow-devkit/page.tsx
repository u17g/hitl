import { getTranslations, setRequestLocale } from "next-intl/server";
import { CodeBlock } from "@/components/docs/code-block";
import { DocPager } from "@/components/docs/doc-pager";
import { snippets } from "@/lib/snippets";

export default async function WorkflowDevkitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs.workflowDevkit");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("clientTitle")}</h2>
        <p className="text-muted-foreground">{t("clientDesc")}</p>
        <CodeBlock code={snippets.workflowClient} filename="lib/hitl-workflow.ts" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("serverTitle")}</h2>
        <p className="text-muted-foreground">{t("serverDesc")}</p>
        <CodeBlock code={snippets.serverSetup} filename="lib/hitl.ts" />
        <CodeBlock
          code={snippets.routeHandlers}
          filename="app/.well-known/hitldev/v1/[[...path]]/route.ts"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("flowTitle")}</h2>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>{t("flow1")}</li>
          <li>{t("flow2")}</li>
          <li>{t("flow3")}</li>
        </ol>
      </section>

      <DocPager locale={locale} slug="workflow-devkit" />
    </div>
  );
}
