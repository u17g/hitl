"use client";

import { Suspense, use } from "react";
import { type BundledLanguage } from "shiki";
import { highlightCode } from "@/lib/shiki";
import { cn } from "@/lib/utils";

const promiseCache = new Map<string, Promise<string>>();

function getHighlightPromise(code: string, lang: BundledLanguage) {
  const key = `${lang}:${code}`;
  let promise = promiseCache.get(key);
  if (!promise) {
    promise = highlightCode(code, lang);
    promiseCache.set(key, promise);
  }
  return promise;
}

function PlainCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return (
    <pre className={cn("overflow-x-auto", className)}>
      <code>{code}</code>
    </pre>
  );
}

function Highlighted({
  code,
  lang,
  className,
}: {
  code: string;
  lang: BundledLanguage;
  className?: string;
}) {
  const html = use(getHighlightPromise(code, lang));

  return (
    <div
      className={cn("syntax-highlight", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function SyntaxHighlight({
  code,
  lang = "typescript",
  className,
}: {
  code: string;
  lang?: BundledLanguage;
  className?: string;
}) {
  return (
    <Suspense fallback={<PlainCode code={code} className={className} />}>
      <Highlighted code={code} lang={lang} className={className} />
    </Suspense>
  );
}
