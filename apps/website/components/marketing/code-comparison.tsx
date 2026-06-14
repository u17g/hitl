"use client";

import { useState } from "react";
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

function Snippet({ code }: { code: string }) {
  const codeClassName =
    "p-4 font-mono text-sm leading-relaxed text-zinc-300 sm:leading-relaxed";

  return (
    <div className="min-w-0 w-full overflow-hidden border border-black/5 bg-zinc-950 dark:border-white/10">
      <div className="h-62 min-w-0 overflow-x-auto overflow-y-auto sm:h-82">
        <SyntaxHighlight
          code={code}
          lang="typescript"
          className={codeClassName}
        />
      </div>
    </div>
  );
}

function TabbedCodeBlock({
  tabs,
}: {
  tabs: { id: string; label: string; code: string }[];
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const codeClassName =
    "p-4 font-mono text-sm leading-relaxed text-zinc-300 sm:leading-relaxed";

  if (!activeTab) return null;

  return (
    <div className="min-w-0 w-full overflow-hidden border border-black/5 bg-zinc-950 dark:border-white/10">
      <div
        role="tablist"
        aria-label="HITL patterns"
        className="flex min-w-0 flex-nowrap overflow-x-auto overscroll-x-contain border-b border-white/10 scrollbar-thin"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-2.5 font-mono text-xs whitespace-nowrap transition-colors",
                isActive
                  ? "border-blue-400 font-semibold text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        className="h-62 min-w-0 overflow-x-auto overflow-y-auto sm:h-82"
      >
        <SyntaxHighlight
          code={activeTab.code}
          lang="typescript"
          className={codeClassName}
        />
      </div>
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
    <div className="min-w-0 w-full overflow-hidden border border-black/5 bg-zinc-950 dark:border-white/10">
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

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <span className="-translate-y-[0.08em] inline-flex items-center bg-sky-400/20 px-1.5 py-1 align-middle font-mono text-[0.75em] font-semibold leading-none text-sky-700 dark:bg-sky-400/25 dark:text-sky-300">
      {children}
    </span>
  );
}

function RowText({
  title,
  desc,
  bullets,
}: {
  title: React.ReactNode;
  desc: string;
  bullets: string[];
}) {
  return (
    <>
      <h3 className="font-display text-2xl leading-snug md:text-3xl">{title}</h3>
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
      id: "one-await",
      title: (
        <>
          {t({ en: "One ", ja: "" })}
          <InlineCode>await</InlineCode>
          {t({ en: "", ja: " だけ" })}
        </>
      ),
      desc: t({
        en: "Replace polling, queues, and resume logic with a single await.",
        ja: "ポーリング・キュー・再開ロジックを、一行で完結。",
      }),
      bullets: [
        t({ en: "No polling", ja: "ポーリング不要" }),
        t({ en: "No queues", ja: "キュー不要" }),
        t({ en: "No custom retry logic", ja: "カスタムリトライロジック不要" }),
      ],
      comparison: {
        before: snippets.withoutHitl,
        after: snippets.withHitl,
      },
      reverse: false,
    },
    {
      id: "wait-for-human",
      title: (
        <>
          {t({ en: "One ", ja: "" })}
          <InlineCode>waitForHuman</InlineCode>
          {t({ en: ", ", ja: " ひとつで、" })}
          <br />
          {t({ en: "tons of patterns", ja: "無限のパターン" })}
        </>
      ),
      desc: t({
        en: "Editable approve, deny with reason, and custom actions — all in one call.",
        ja: "内容を修正して承認・フィードバックを含めてキャンセル・状況に合わせてカスタマイズまで、ひとつで。",
      }),
      bullets: [
        t({ en: "Approve with editable fields", ja: "内容を修正して承認" }),
        t({ en: "Deny with a reason", ja: "フィードバックを含めてキャンセル" }),
        t({ en: "Custom actions for any workflow", ja: "状況に合わせてカスタマイズ" }),
      ],
      tabs: [
        {
          id: "email-review",
          label: t({ en: "Email review", ja: "メールレビュー" }),
          code: snippets.hitlPatternEmailReview,
        },
        {
          id: "expense",
          label: t({ en: "Expense report", ja: "経費申請" }),
          code: snippets.hitlPatternExpense,
        },
        {
          id: "deploy",
          label: t({ en: "Production deploy", ja: "本番デプロイ" }),
          code: snippets.hitlPatternDeploy,
        },
        {
          id: "refund",
          label: t({ en: "Refund", ja: "返金申請" }),
          code: snippets.hitlPatternRefund,
        },
        {
          id: "access",
          label: t({ en: "Access request", ja: "アクセス申請" }),
          code: snippets.hitlPatternAccess,
        },
        {
          id: "data-export",
          label: t({ en: "Data export", ja: "データエクスポート" }),
          code: snippets.hitlPatternDataExport,
        },
      ],
      reverse: true,
    },
    {
      id: "reminders",
      title: (
        <>
          <InlineCode>remind</InlineCode>
          {t({ en: " or ", ja: " または " })}
          <InlineCode>escalate</InlineCode>
          <br />
          {t({ en: "at any time", ja: "任意のタイミングで" })}
        </>
      ),
      desc: t({
        en: "Keep following up in-thread or on another channel — on your schedule.",
        ja: "同じスレッドでリマインド、別チャネルにも届けられる。承認待ちのまま放置しない。",
      }),
      bullets: [
        t({
          en: "Remind after an hour",
          ja: "1時間後にリマインド",
        }),
        t({
          en: "Every weekday morning",
          ja: "平日の朝にリマインド",
        }),
        t({
          en: "Escalate when it's time",
          ja: "適切なタイミングでエスカレーション",
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
              en: "Human oversight as code — easy to integrate into any workflow, easy to build automation people can trust.",
              ja: "人が判断すべき箇所をコードで定義するだけ。信頼できるワークフローを、手軽に作る。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 space-y-20">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid min-w-0 items-center gap-8 lg:grid-cols-3 lg:gap-12"
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
                className={cn(
                  "min-w-0",
                  row.reverse ? "lg:order-1 lg:col-span-2" : "lg:col-span-2",
                )}
              >
                {"tabs" in row && row.tabs ? (
                  <TabbedCodeBlock tabs={row.tabs} />
                ) : "comparison" in row && row.comparison ? (
                  <ComparisonBlock
                    beforeLabel={t({ en: "Without HITL SDK", ja: "HITL SDK なし" })}
                    afterLabel={t({ en: "With HITL SDK", ja: "HITL SDK あり" })}
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
