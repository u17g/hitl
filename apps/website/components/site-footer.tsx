"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useInlineTranslation();

  const columns = [
    {
      title: t({ en: "Product", ja: "プロダクト" }),
      links: [
        { label: t({ en: "Getting started", ja: "はじめに" }), href: "/docs/getting-started" },
        { label: t({ en: "Installation", ja: "インストール" }), href: "/docs/installation" },
        { label: t({ en: "Channels", ja: "チャネル" }), href: "/docs/channels" },
        { label: t({ en: "Workflow DevKit", ja: "Workflow DevKit" }), href: "/docs/workflow-devkit" },
      ],
    },
    {
      title: t({ en: "Developers", ja: "開発者" }),
      links: [
        { label: "GitHub", href: "https://github.com/u17g/hitl", external: true },
        { label: "npm", href: "https://www.npmjs.com/package/hitl", external: true },
        { label: t({ en: "hello-world", ja: "hello-world" }), href: "https://github.com/u17g/hitl/tree/main/examples/hello-world", external: true },
      ],
    },
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-12 md:grid-cols-3">
          <div>
            <p className="font-mono text-sm font-medium">HITL sdk</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {t({
                en: "Human-in-the-loop for AI agents and durable workflows.",
                ja: "AI エージェントと耐久ワークフロー向け Human-in-the-loop。",
              })}
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {col.title}
              </p>
              <nav className="mt-4 flex flex-col gap-2">
                {col.links.map((link) =>
                  "external" in link && link.external ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </nav>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t({ en: "MIT License", ja: "MIT License" })}</p>
          <p className="font-mono text-xs">Unbounded Pioneering Inc. · 2026</p>
        </div>
      </div>
    </footer>
  );
}
