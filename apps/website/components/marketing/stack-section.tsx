"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
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
    <section className="border-y bg-muted/30 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t({ en: "Bring your own stack", ja: "既存スタックをそのまま使う" })}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t({
              en: "Hitl SDK plugs into the tools you already use. It does not replace your agent framework or workflow engine.",
              ja: "Hitl SDK は既存ツールに差し込むだけ。エージェントフレームワークやワークフローエンジンを置き換えません。",
            })}
          </p>
        </div>
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
      </div>
    </section>
  );
}
