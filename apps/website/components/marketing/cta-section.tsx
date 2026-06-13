"use client";

import { ArrowRight } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  const t = useInlineTranslation();

  return (
    <section className="border-t bg-muted/30 py-24">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t({
            en: "Create your first approval flow today.",
            ja: "最初の承認フローを作りましょう。",
          })}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          {t({
            en: "See Hitl SDK in action with the hello-world example.",
            ja: "hello-world サンプルで Hitl SDK を試せます。",
          })}
        </p>
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
      </div>
    </section>
  );
}
