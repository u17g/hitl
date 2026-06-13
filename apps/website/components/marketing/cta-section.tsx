"use client";

import { ArrowRight } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
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
    <Section variant="muted" className="border-y-0 border-t">
      <SectionContainer className="text-center">
        <SectionTitle>
          {t({
            en: "Create your first approval flow today.",
            ja: "最初の承認フローを作りましょう。",
          })}
        </SectionTitle>
        <SectionDescription className="mx-auto max-w-xl">
          {t({
            en: "See Hitl SDK in action with the hello-world example.",
            ja: "hello-world サンプルで Hitl SDK を試せます。",
          })}
        </SectionDescription>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/docs/getting-started">
              {t({ en: "Read the docs", ja: "ドキュメントを読む" })}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a
              href="https://github.com/u17g/hitl/tree/main/examples/hello-world"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t({ en: "Run hello-world", ja: "hello-world を実行" })}
            </a>
          </Button>
        </div>
      </SectionContainer>
    </Section>
  );
}
