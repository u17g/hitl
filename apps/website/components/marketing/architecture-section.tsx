"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { ArchitectureDiagram } from "@/components/marketing/architecture-diagram";

export function ArchitectureSection() {
  const t = useInlineTranslation();

  const points = [
    t({
      en: "Workflow suspends on a durable hook and POSTs a request via a memoized step.",
      ja: "ワークフローが耐久フックでサスペンドし、メモ化されたステップでリクエストを POST。",
    }),
    t({
      en: "Server records the request and delivers to your channel adapter.",
      ja: "サーバーがリクエストを記録し、チャネルアダプターへ配信。",
    }),
    t({
      en: "Reviewer approves — server resolves the hook and the workflow resumes.",
      ja: "レビュアーが承認 — サーバーがフックを解決し、ワークフローが再開。",
    }),
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t({ en: "How it works", ja: "仕組み" })}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t({
            en: "The workflow and the server are separate processes. The .well-known/hitl/v1 API is the only thing between them.",
            ja: "ワークフローとサーバーは別プロセス。.well-known/hitl/v1 API だけが両者をつなぎます。",
          })}
        </p>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:items-center">
        <ArchitectureDiagram />
        <ol className="space-y-4">
          {points.map((point, i) => (
            <li key={point} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium">
                {i + 1}
              </span>
              <p className="pt-1 text-muted-foreground">{point}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
