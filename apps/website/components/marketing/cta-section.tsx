"use client";

import { ArrowRight } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { GetStartedCard } from "@/components/marketing/get-started-card";

export function CtaSection() {
  const t = useInlineTranslation();

  return (
    <Section className="section-bg-pink">
      <SectionContainer size="6xl">
        <div className="overflow-hidden">
          <div className="">
            <div className="p-8 md:p-12">
              <p className="parallel-section-label mb-4">
                {t({ en: "Try now", ja: "今すぐ試す" })}
              </p>
              <SectionTitle className="text-left text-3xl md:text-4xl">
                {t({
                  en: "Create your first approval flow today.",
                  ja: "HITL sdk で、信頼性のあるワークフローを構築しましょう",
                })}
              </SectionTitle>
              <GetStartedCard className="mt-8" />
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="rounded-full" asChild>
                  <Link href="/docs/quickstart">
                    {t({ en: "or read the docs", ja: "もしくは、ドキュメントを読む" })}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SectionContainer>
    </Section>
  );
}
