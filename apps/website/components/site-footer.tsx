"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useInlineTranslation();

  const columns = [
    {
      title: t({ en: "Documentation", ja: "Documentation" }),
      links: [
        { label: t({ en: "Overview", ja: "概要" }), href: "/docs/overview" },
        { label: t({ en: "Quickstart", ja: "クイックスタート" }), href: "/docs/quickstart" },
        { label: t({ en: "Install", ja: "インストール" }), href: "/docs/install" },
        { label: t({ en: "Workflow Engines", ja: "ワークフローエンジン" }), href: "/docs/workflow-engines" },
        { label: t({ en: "State", ja: "ステート" }), href: "/docs/state" },
        { label: t({ en: "Delivery", ja: "チャンネル" }), href: "/docs/delivery" },
        { label: t({ en: "Integration", ja: "インテグレーション" }), href: "/docs/integration" },
      ],
    },
    {
      title: t({ en: "Developers", ja: "Developers" }),
      links: [
        { label: "GitHub", href: "https://github.com/u17g/hitl", external: true },
        { label: "npm", href: "https://www.npmjs.com/package/hitl", external: true },
      ],
    },
    {
      title: t({ en: "About us", ja: "About us" }),
      links: [
        { label: "Unbounded Pioneering Inc.", href: "https://u17g.com/ja-jp", external: true },
        { label: "- Turnint AI", href: "https://turnint.ai/ja", external: true },
      ],
    },
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div>
            <p className="font-mono text-sm font-medium">HITL sdk</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {t({
                en: "A unified TypeScript SDK for human-in-the-loop approval in your mission critical AI workflows.",
                ja: "ヒューマン・イン・ザ・ループを組み込むための Unified TypeScript SDK",
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
