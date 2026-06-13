import { getTranslations, setRequestLocale } from "next-intl/server";
import { CodeBlock } from "@/components/docs/code-block";
import { DocPager } from "@/components/docs/doc-pager";
import { snippets } from "@/lib/snippets";

export default async function ChannelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs.channels");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("chatTitle")}</h2>
        <p className="text-muted-foreground">{t("chatDesc")}</p>
        <CodeBlock code={snippets.chatAdapter} filename="lib/chat.ts" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("inboxTitle")}</h2>
        <p className="text-muted-foreground">{t("inboxDesc")}</p>
        <CodeBlock code={snippets.inboxApi} filename="api/inbox/route.ts" />
      </section>

      <DocPager locale={locale} slug="channels" />
    </div>
  );
}
