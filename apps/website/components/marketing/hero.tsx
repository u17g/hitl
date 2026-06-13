import { ArrowRight, Github } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CodeBlock } from "@/components/docs/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { snippets } from "@/lib/snippets";

export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section className="relative overflow-hidden border-b">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-6">
            {t("badge")}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl md:leading-tight">
            {t("title")}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/docs/getting-started">
                {t("ctaDocs")}
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
                {t("ctaGithub")}
              </a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">{t("notFramework")}</p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl">
          <CodeBlock code={snippets.install} filename="terminal" />
        </div>
      </div>
    </section>
  );
}
