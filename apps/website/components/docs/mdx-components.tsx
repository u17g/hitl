import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "@/components/docs/code-block";
import { MermaidDiagram } from "@/components/docs/mermaid-diagram";
import { Link } from "@/i18n/navigation";
import {
  fenceLangToShiki,
  isPlainFenceLang,
} from "@/lib/shiki";
import { cn } from "@/lib/utils";

type MDXComponents = Record<string, React.ComponentType<Record<string, unknown>>>;

function getTextContent(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return getTextContent(props.children);
  }
  return "";
}

function Pre({
  children,
  ...props
}: ComponentProps<"pre"> & { "data-language"?: string }) {
  const child = Array.isArray(children) ? children[0] : children;
  if (child && typeof child === "object" && "props" in child) {
    const codeProps = child.props as {
      children?: ReactNode;
      className?: string;
    };
    const langMatch = codeProps.className?.match(/language-([\w-]+)/);
    if (langMatch?.[1]) {
      const fenceLang = langMatch[1];
      const code = getTextContent(codeProps.children).replace(/\n$/, "");

      if (fenceLang === "mermaid") {
        return <MermaidDiagram chart={code} />;
      }

      if (isPlainFenceLang(fenceLang)) {
        return (
          <pre
            className="overflow-x-auto rounded border border-border bg-muted/50 p-4 font-mono text-sm leading-relaxed"
            {...props}
          >
            <code>{code}</code>
          </pre>
        );
      }

      const filename =
        props["data-language"] ??
        (fenceLang === "bash" ||
        fenceLang === "sh" ||
        fenceLang === "shell"
          ? "terminal"
          : fenceLang === "typescript" || fenceLang === "tsx"
            ? "workflow.ts"
            : undefined);

      return (
        <CodeBlock
          code={code}
          filename={filename}
          lang={fenceLangToShiki(fenceLang)}
        />
      );
    }
  }

  return <pre {...props}>{children}</pre>;
}

const inlineCodeClassName =
  "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] font-normal text-foreground before:content-none after:content-none";

export const mdxComponents: MDXComponents = {
  a: ({
    href,
    children,
    ...props
  }: ComponentProps<"a">) => {
    if (href?.startsWith("/")) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
  pre: Pre,
  code: ({
    children,
    className,
    ...props
  }: ComponentProps<"code">) => {
    const isInline = !className?.includes("language-");
    if (isInline) {
      return (
        <code className={cn(inlineCodeClassName, className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  table: ({ children, ...props }: ComponentProps<"table">) => (
    <div className="overflow-x-auto">
      <table {...props}>{children}</table>
    </div>
  ),
};

export function DocsProse({ children }: { children: ReactNode }) {
  return (
    <div className="prose prose-neutral dark:prose-invert prose-code:before:content-none prose-code:after:content-none prose-table:w-full max-w-none">
      {children}
    </div>
  );
}
