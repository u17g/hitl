import { getTranslations } from "next-intl/server";
import { CodeBlock } from "@/components/docs/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { snippets } from "@/lib/snippets";

export async function CodeComparison() {
  const t = await getTranslations("compare");

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="mt-12">
        <Tabs defaultValue="with" className="mx-auto max-w-3xl">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="with">{t("withHitl")}</TabsTrigger>
            <TabsTrigger value="without">{t("withoutHitl")}</TabsTrigger>
          </TabsList>
          <TabsContent value="with" className="mt-4">
            <CodeBlock code={snippets.withHitl} filename="workflow.ts" />
          </TabsContent>
          <TabsContent value="without" className="mt-4">
            <CodeBlock code={snippets.withoutHitl} filename="workflow.ts" />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
