"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
import { SyntaxHighlight } from "@/components/syntax-highlight";
import { cn } from "@/lib/utils";
import { snippets } from "@/lib/snippets";

function Snippet({ code, className }: { code: string; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-border bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300 dark:bg-black/50 sm:text-sm",
        className,
      )}
    >
      <SyntaxHighlight code={code} lang="typescript" />
    </div>
  );
}

function ComparisonBlock({
  beforeLabel,
  afterLabel,
  before,
  after,
}: {
  beforeLabel: string;
  afterLabel: string;
  before: string;
  after: string;
}) {
  const codeClassName =
    "p-4 font-mono leading-snug text-zinc-300 sm:leading-relaxed";

  return (
    <div className="overflow-hidden border border-black/5 bg-zinc-950 dark:border-white/10">
      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col overflow-hidden border-b border-white/10 bg-zinc-950 sm:border-r sm:border-b-0">
          <div className="shrink-0 border-b border-white/10 px-4 py-2.5">
            <span className="font-mono text-xs text-zinc-500">{beforeLabel}</span>
          </div>
          <div className="h-62 overflow-hidden sm:h-82">
            <SyntaxHighlight
              code={before}
              lang="typescript"
              className={cn(codeClassName, "overflow-hidden text-[6px]")}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col overflow-hidden bg-zinc-900">
          <div className="shrink-0 border-b border-zinc-800 px-4 py-2.5">
            <span className="font-mono text-xs font-semibold text-blue-400">{afterLabel}</span>
          </div>
          <div className="flex h-62 items-center overflow-hidden sm:h-82">
            <SyntaxHighlight
              code={after}
              lang="typescript"
              className={cn(codeClassName, "w-full overflow-hidden text-sm sm:text-md")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RowText({
  title,
  desc,
  bullets,
}: {
  title: string;
  desc: string;
  bullets: string[];
}) {
  return (
    <>
      <h3 className="font-display text-2xl md:text-3xl">{title}</h3>
      <p className="mt-3 text-muted-foreground">{desc}</p>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span aria-hidden="true">—</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CodeComparison() {
  const t = useInlineTranslation();

  const rows = [
    {
      title: t({ en: "One await", ja: "1つの await" }),
      desc: t({
        en: "Suspend on a durable hook and resume when a human decides.",
        ja: "耐久フックでサスペンドし、人間が判断したら再開します。",
      }),
      bullets: [
        t({ en: "No polling", ja: "ポーリング不要" }),
        t({ en: "No queues", ja: "キュー不要" }),
        t({ en: "No custom retry logic", ja: "独自リトライ不要" }),
      ],
      comparison: {
        before: snippets.withoutHitl,
        after: snippets.withHitl,
      },
      reverse: false,
    },
    {
      title: t({
        en: "One waitForHuman, multiple use cases",
        ja: "1つの waitForHuman、複数のユースケース",
      }),
      desc: t({
        en: "Model every approval pattern with typed actions — validated end to end.",
        ja: "型付き actions であらゆる承認パターンを、エンドツーエンドに検証。",
      }),
      bullets: [
        t({ en: "Approve with editable fields", ja: "編集付き承認" }),
        t({ en: "Deny with a reason", ja: "理由付き拒否" }),
        t({ en: "Custom actions for any workflow", ja: "任意ワークフロー向けカスタム action" }),
      ],
      code: snippets.actionPatterns,
      reverse: true,
    },
    {
      title: t({ en: "Reminders", ja: "リマインダー" }),
      desc: t({
        en: "Nudge approvers while a request is pending — on the same thread or a fallback channel.",
        ja: "承認待ちの間、同じスレッドまたはフォールバックチャネルで催促できます。",
      }),
      bullets: [
        t({
          en: "Thread reminders with remind.after()",
          ja: "remind.after() でスレッド内リマインド",
        }),
        t({
          en: "Escalate to another channel with escalate.to()",
          ja: "escalate.to() で別チャネルへエスカレーション",
        }),
      ],
      code: snippets.remindersExample,
      reverse: false,
    },
  ];

  return (
    <Section>
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionTitle>
            Human-in-the-loop as code
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "Move from hand-rolled queues and custom retries to durable, resumable human approval with a single await.",
              ja: "手作りのキューやリトライから、1つの await で実現する耐久・再開可能な人間承認へ。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 space-y-20">
          {rows.map((row) => (
            <div
              key={row.title}
              className="grid items-center gap-8 lg:grid-cols-3 lg:gap-12"
            >
              <div
                className={
                  row.reverse ? "lg:order-2 lg:col-span-1" : "lg:col-span-1"
                }
              >
                <RowText
                  title={row.title}
                  desc={row.desc}
                  bullets={row.bullets}
                />
              </div>
              <div
                className={
                  row.reverse ? "lg:order-1 lg:col-span-2" : "lg:col-span-2"
                }
              >
                {"comparison" in row && row.comparison ? (
                  <ComparisonBlock
                    beforeLabel={t({ en: "Without HITL", ja: "Hitl SDK なし" })}
                    afterLabel={t({ en: "With HITL", ja: "Hitl SDK あり" })}
                    before={row.comparison.before}
                    after={row.comparison.after}
                  />
                ) : (
                  "code" in row && row.code && <Snippet code={row.code} />
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionContainer>
    </Section>
  );
}
