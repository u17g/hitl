"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";

export function LogoStrip() {
  const t = useInlineTranslation();

  const logos = [
    "AI SDK",
    "Workflow DevKit",
    "Slack",
    "Teams",
    "Discord",
    "Inngest",
    "Vercel",
  ];

  return (
    <section className="border-y border-border py-12">
      <div className="mx-auto max-w-6xl px-4">
        <p className="mb-8 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {t({
            en: "Built for production agents, works with your stack",
            ja: "本番エージェント向け、既存スタックと連携",
          })}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {logos.map((logo) => (
            <span
              key={logo}
              className="font-mono text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {logo}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
