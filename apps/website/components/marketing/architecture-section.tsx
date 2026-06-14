"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { ArchitectureDiagram } from "@/components/marketing/architecture-diagram";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionLabel,
  SectionTitle,
} from "@/components/section";

export function ArchitectureSection() {
  const t = useInlineTranslation();

  const points = [
    {
      step: "01",
      text: t({
        en: "Workflow suspends on a durable hook and POSTs a request via a memoized step.",
        ja: "ワークフローが耐久フックでサスペンドし、メモ化されたステップでリクエストを POST。",
      }),
    },
    {
      step: "02",
      text: t({
        en: "Server records the request and delivers to your channel adapter.",
        ja: "サーバーがリクエストを記録し、チャネルアダプターへ配信。",
      }),
    },
    {
      step: "03",
      text: t({
        en: "Reviewer approves — server resolves the hook and the workflow resumes.",
        ja: "レビュアーが承認 — サーバーがフックを解決し、ワークフローが再開。",
      }),
    },
  ];

  return (
    <Section>
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionLabel>
            {t({ en: "Architecture", ja: "アーキテクチャ" })}
          </SectionLabel>
          <SectionTitle>
            {t({ en: "How it works", ja: "仕組み" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "The workflow and the server are separate processes. The .well-known/hitl/v1 API is the only thing between them.",
              ja: "ワークフローとサーバーは別プロセス。.well-known/hitl/v1 API だけが両者をつなぎます。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:items-start">
          <ArchitectureDiagram />
          <div className="space-y-6">
            {points.map(({ step, text }) => (
              <div key={step} className="parallel-card flex gap-4 p-5">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {step}
                </span>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionContainer>
    </Section>
  );
}
