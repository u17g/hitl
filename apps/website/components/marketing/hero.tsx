"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function Hero() {
  const t = useInlineTranslation();

  return (
    <Section variant="hero" className="bg-background">
      <div className="px-6 md:px-8 pt-12 md:pt-16">
        <h1 className="font-display text-3xl font-medium leading-[1.15] tracking-tight md:text-4xl">
          <span className="text-brand">
            {t({
              en: "Human approval layer",
              ja: "人の判断",
            })}
          </span>
          {t({
            en: " for your mission critical AI workflows",
            ja: "とAIを組み合わせ、クリティカルな業務を自動化",
          })}
        </h1>
        <p className="font-display mt-5 text-muted-foreground text-2xl font-medium leading-[1.15] tracking-tight md:text-2xl">
          {t({
            en: "A unified typescript SDK for human-in-the-loop",
            ja: "ヒューマン・イン・ザ・ループを組み込むための Unified TypeScript SDK",
          })}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant="default" size="lg" asChild>
            <Link href="/docs/quickstart">
              {t({ en: "Get started", ja: "はじめる" })}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a
              href="https://github.com/u17g/hitl/tree/main/examples/hello-world"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t({ en: "Document", ja: "ドキュメント" })}
            </a>
          </Button>
        </div>
      </div>

      <div className="hero-visual-bg relative mt-12 w-full min-w-0 overflow-hidden md:mt-16">
        <div className="flex min-h-[420px] w-full min-w-0 items-center justify-center px-2 py-12 sm:px-4 md:py-16">
          <HeroDemo />
        </div>
      </div>
    </Section>
  );
}
