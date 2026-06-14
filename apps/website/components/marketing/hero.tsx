"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { HeroDemo } from "@/components/marketing/hero-demo";
import {
  Section,
  SectionContainer,
} from "@/components/section";
import { Button } from "@/components/ui/button";

export function Hero() {
  const t = useInlineTranslation();

  return (
    <Section variant="hero" className="bg-background">
      <SectionContainer size="6xl" className="pt-12 pb-0 md:pt-16">
        <div className="">
          <h1 className="text-3xl font-semibold leading-[1.15] tracking-tight md:text-4xl">
            <span className="text-brand">
              {t({
                en: "Human approval layer",
                ja: "ヒューマン・イン・ザ・ループ",
              })}
            </span>
            {t({
              en: " for your mission critical AI workflows",
              ja: "のためのライブラリ",
            })}
          </h1>
          <p className="mt-5 text-muted-foreground text-2xl font-medium leading-[1.15] tracking-tight md:text-2xl">
            {t({
              en: "A unified typescript SDK for human-in-the-loop",
              ja: "クリティカルなワークフローに人の承認を組み込む Unified TypeScript SDK",
            })}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="default" size="lg" asChild>
              <Link href="/docs/getting-started">
                {t({ en: "Get started", ja: "はじめる" })}
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
      </SectionContainer>
    </Section>
  );
}
