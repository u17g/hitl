"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { CodeBlock } from "@/components/docs/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { snippets } from "@/lib/snippets";

export function CodeComparison() {
  const t = useInlineTranslation();

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t({ en: "Reliability-as-code", ja: "信頼性をコードで" })}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t({
            en: "Move from hand-rolled queues and custom retries to durable, resumable human approval with a single await.",
            ja: "手作りのキューやリトライから、1つの await で実現する耐久・再開可能な人間承認へ。",
          })}
        </p>
      </div>
      <div className="mt-12">
        <Tabs defaultValue="with" className="mx-auto max-w-3xl">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="with">
              {t({ en: "With Hitl SDK", ja: "Hitl SDK あり" })}
            </TabsTrigger>
            <TabsTrigger value="without">
              {t({ en: "Without Hitl SDK", ja: "Hitl SDK なし" })}
            </TabsTrigger>
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
