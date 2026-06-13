"use client";

import { ArrowRight, Github } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { CodeBlock } from "@/components/docs/code-block";
import { Button } from "@/components/ui/button";
import {
  Section,
  SectionContainer,
} from "@/components/section";
import { snippets } from "@/lib/snippets";

export function Hero() {
  const t = useInlineTranslation();

  return (
    <Section variant="hero">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <SectionContainer className="relative py-24 md:py-32">
        <SectionContainer className="px-0">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl md:leading-tight">
            {t({
              en: "Human in the loop",
              ja: "Human in the loop",
            })}
            <br />
            {t({
              en: "for AI and workflows",
              ja: "for AI agents and workflows",
            })}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl">
            {t({
              en: "A unified typescript SDK for human-in-the-loop in AI agents, durable workflows and any chat platforms - Slack, Teams, Dicord, Web app etc.",
              ja: "信頼性のある AI エージェントとワークフローを作る TypeScript SDK。",
            })}
            <br />
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
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
        </SectionContainer>
        <SectionContainer size="2xl" className="mt-16 px-0">
          <CodeBlock code={snippets.install} filename="terminal" />
        </SectionContainer>
      </SectionContainer>
    </Section >
  );
}
