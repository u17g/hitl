"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { Separator } from "@/components/ui/separator";

export function SiteFooter() {
  const t = useInlineTranslation();

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Hitl SDK</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t({
                en: "Human-in-the-loop for AI agents and durable workflows.",
                ja: "AI エージェントと耐久ワークフロー向け Human-in-the-loop。",
              })}
            </p>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/docs/getting-started" className="hover:text-foreground">
              {t({ en: "Docs", ja: "ドキュメント" })}
            </Link>
            <a
              href="https://github.com/u17g/hitl"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {t({ en: "GitHub", ja: "GitHub" })}
            </a>
            <a
              href="https://www.npmjs.com/package/hitl"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {t({ en: "npm", ja: "npm" })}
            </a>
          </nav>
        </div>
        <Separator className="my-6" />
        <p className="text-sm text-muted-foreground">
          {t({ en: "MIT License", ja: "MIT License" })}
        </p>
      </div>
    </footer>
  );
}
