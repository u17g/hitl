"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionLabel,
  SectionTitle,
} from "@/components/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { snippets } from "@/lib/snippets";

export function CodeComparison() {
  const t = useInlineTranslation();

  const features = [
    {
      title: t({ en: "One await", ja: "1つの await" }),
      desc: t({
        en: "Suspend on a durable hook. No queues, no polling, no custom retry logic.",
        ja: "耐久フックでサスペンド。キュー・ポーリング・独自リトライは不要。",
      }),
    },
    {
      title: t({ en: "Typed actions", ja: "型付き actions" }),
      desc: t({
        en: "Approve, deny, and edit with structured fields — validated end to end.",
        ja: "承認・拒否・編集を構造化フィールドで、エンドツーエンドに検証。",
      }),
    },
    {
      title: t({ en: "Resume anywhere", ja: "どこからでも再開" }),
      desc: t({
        en: "Hours or days later, a single hook resolution picks up exactly where you left off.",
        ja: "数時間・数日後でも、フック解決1回で中断地点から再開。",
      }),
    },
  ];

  return (
    <Section>
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionLabel>
            {t({ en: "Reliability", ja: "信頼性" })}
          </SectionLabel>
          <SectionTitle>
            {t({ en: "Reliability-as-code", ja: "信頼性をコードで" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "Move from hand-rolled queues and custom retries to durable, resumable human approval with a single await.",
              ja: "手作りのキューやリトライから、1つの await で実現する耐久・再開可能な人間承認へ。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="parallel-card p-6">
              <h3 className="font-mono text-sm font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <Tabs defaultValue="with" className="mx-auto w-full max-w-3xl">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg border border-border bg-muted/30 p-1">
              <TabsTrigger
                value="with"
                className="rounded-md font-mono text-xs data-[state=active]:bg-background"
              >
                {t({ en: "With Hitl SDK", ja: "Hitl SDK あり" })}
              </TabsTrigger>
              <TabsTrigger
                value="without"
                className="rounded-md font-mono text-xs data-[state=active]:bg-background"
              >
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
      </SectionContainer>
    </Section>
  );
}
