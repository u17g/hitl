"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function StackSection() {
  const t = useInlineTranslation();

  const items = [
    {
      title: "AI SDK",
      description: t({
        en: "Use familiar AI SDK patterns with durable human review steps.",
        ja: "おなじみの AI SDK パターンに、耐久な人間レビューステップを追加。",
      }),
    },
    {
      title: "Workflow DevKit",
      description: t({
        en: "Suspend, sleep, and resume with zero infrastructure setup on Vercel.",
        ja: "Vercel 上でインフラ設定なしにサスペンド・スリープ・再開。",
      }),
    },
  ];

  return (
    <Section variant="muted">
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>
            {t({ en: "Bring your own stack", ja: "既存スタックをそのまま使う" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "Hitl SDK plugs into the tools you already use. It does not replace your agent framework or workflow engine.",
              ja: "Hitl SDK は既存ツールに差し込むだけ。エージェントフレームワークやワークフローエンジンを置き換えません。",
            })}
          </SectionDescription>
        </SectionHeader>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {items.map(({ title, description }) => (
            <Card key={title} className="border bg-background">
              <CardHeader>
                <CardTitle className="text-2xl">{title}</CardTitle>
                <CardDescription className="text-base">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </SectionContainer>
    </Section>
  );
}
