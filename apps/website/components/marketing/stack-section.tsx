"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionLabel,
  SectionTitle,
} from "@/components/section";

export function StackSection() {
  const t = useInlineTranslation();

  const items = [
    {
      title: "AI SDK",
      description: t({
        en: "Use familiar AI SDK patterns with durable human review steps.",
        ja: "おなじみの AI SDK パターンに、耐久な人間レビューステップを追加。",
      }),
      tag: "agent",
    },
    {
      title: "Workflow DevKit",
      description: t({
        en: "Suspend, sleep, and resume with zero infrastructure setup on Vercel.",
        ja: "Vercel 上でインフラ設定なしにサスペンド・スリープ・再開。",
      }),
      tag: "workflow",
    },
    {
      title: "Inngest",
      description: t({
        en: "Plug in the Inngest resolver for event-driven human approval flows.",
        ja: "Inngest resolver でイベント駆動の人間承認フローを構築。",
      }),
      tag: "events",
    },
    {
      title: "Chat SDK",
      description: t({
        en: "One adapter for Slack, Teams, and Discord — no per-platform wiring.",
        ja: "Slack・Teams・Discord を1アダプターで。プラットフォーム別配線は不要。",
      }),
      tag: "channels",
    },
  ];

  return (
    <Section>
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionTitle>
            {t({ en: "Bring your own stack", ja: "既存スタックをそのまま使う" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "HITL SDK plugs into the tools you already use. It does not replace your agent framework or workflow engine.",
              ja: "HITL SDK は既存ツールに差し込むだけ。エージェントフレームワークやワークフローエンジンを置き換えません。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {items.map(({ title, description, tag }) => (
            <div key={title} className="parallel-card p-6">
              <span className="kbd-hint">{tag}</span>
              <h3 className="mt-4 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </SectionContainer>
    </Section>
  );
}
