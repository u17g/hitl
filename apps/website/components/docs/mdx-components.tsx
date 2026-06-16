import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "@/components/docs/code-block";
import { Link } from "@/i18n/navigation";

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
  if (
    child &&
    typeof child === "object" &&
    "props" in child &&
    child.type === "code"
  ) {
    const codeProps = child.props as {
      children?: ReactNode;
      className?: string;
    };
    const code = getTextContent(codeProps.children).replace(/\n$/, "");
    const langClass = codeProps.className?.match(/language-(\w+)/)?.[1];
    const filename =
      props["data-language"] ??
      (langClass === "bash" || langClass === "sh" || langClass === "shell"
        ? "terminal"
        : langClass === "typescript" || langClass === "tsx"
          ? "workflow.ts"
          : undefined);

    return <CodeBlock code={code} filename={filename} />;
  }

  return <pre {...props}>{children}</pre>;
}

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
        <code className={className} {...props}>
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
};

export function DocsProse({ children }: { children: ReactNode }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      {children}
    </div>
  );
}
