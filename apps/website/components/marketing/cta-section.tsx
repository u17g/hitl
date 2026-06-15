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

export function CtaSection() {
  const t = useInlineTranslation();

  return (
    <Section variant="muted">
      <SectionContainer size="6xl">
        <div className="parallel-card overflow-hidden">
          <div className="grid lg:grid-cols-2">
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
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="rounded-full" asChild>
                  <Link href="/docs/getting-started">
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
            <div className="border-t border-border lg:border-t-0 lg:border-l">
              <div className="border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground">
                {t({ en: "Agent onboarding", ja: "エージェント向けセットアップ" })}
              </div>
              <div className="p-4">
                <CodeBlock
                  code={`npm i @hitl-sdk/hitl\n\n# Read docs at /docs/getting-started`}
                  filename="terminal"
                />
              </div>
            </div>
          </div>
        </div>
      </SectionContainer>
    </Section>
  );
}
