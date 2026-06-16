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
                {t({ en: "Quick start", ja: "クイックスタート" })}
              </p>
              <SectionTitle className="text-left text-3xl md:text-4xl">
                {t({
                  en: "Create your first approval flow today.",
                  ja: "最初の承認フローを作りましょう。",
                })}
              </SectionTitle>
              <SectionDescription className="text-left">
                {t({
                  en: "See HITL sdk in action with the hello-world example.",
                  ja: "hello-world サンプルで HITL sdk を試せます。",
                })}
              </SectionDescription>
              <GetStartedCard className="mt-8" />
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="rounded-full" asChild>
                  <Link href="/docs/quickstart">
                    {t({ en: "Read the docs", ja: "ドキュメントを読む" })}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full" asChild>
                  <a
                    href="https://github.com/u17g/hitl/tree/main/examples/hello-world"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t({ en: "Run hello-world", ja: "hello-world を実行" })}
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SectionContainer>
    </Section>
  );
}
