"use client";

import { ArrowRight, Github } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { CodeBlock } from "@/components/docs/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { snippets } from "@/lib/snippets";

export function Hero() {
  const t = useInlineTranslation();

  return (
    <section className="relative overflow-hidden border-b">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl md:leading-tight">
            {t({
              en: "Make any workflow human-aware",
              ja: "あらゆるワークフローを人間対応に",
            })}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            {t({
              en: "A unified human-in-the-loop layer for AI agents and durable workflows — one await, suspend for hours or days, resume when a human approves in Slack, Teams, Discord, or a web inbox.",
              ja: "AI エージェントと耐久ワークフロー向けの統一 HITL レイヤー — 1つの await で数時間・数日サスペンドし、Slack・Teams・Discord・Web inbox で人間が承認したら再開します。",
            })}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/docs/getting-started">
                {t({ en: "Get started", ja: "はじめる" })}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a
                href="https://github.com/u17g/hitl"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                {t({ en: "View on GitHub", ja: "GitHub を見る" })}
              </a>
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-16 max-w-2xl">
          <CodeBlock code={snippets.install} filename="terminal" />
        </div>
      </div>
    </section>
  );
}
