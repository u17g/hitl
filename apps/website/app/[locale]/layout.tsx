import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { createInlineTranslator } from "@/i18n/inline-translation";
import { type Locale, routing } from "@/i18n/routing";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = createInlineTranslator(locale as Locale);

  return {
    title: t({
      en: "Hitl SDK — Human-in-the-loop for AI agents and durable workflows",
      ja: "Hitl SDK — AI エージェントと耐久ワークフロー向け Human-in-the-loop",
    }),
    description: t({
      en: "A unified TypeScript SDK for human-in-the-loop approval in AI agents and durable workflows. One await, suspend for hours or days, resume when a human approves.",
      ja: "AI エージェントと耐久ワークフローに人間の承認を組み込む統一 TypeScript SDK。1つの await で数時間・数日サスペンドし、Slack・Teams・Discord・Web inbox で承認されたら再開します。",
    }),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
