"use client";

import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function MermaidDiagram({
  chart,
  className,
}: {
  chart: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      const theme = resolvedTheme === "dark" ? "dark" : "neutral";

      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: "strict",
      });

      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, chart.trim());
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm leading-relaxed">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "my-6 overflow-x-auto rounded-lg border border-border bg-card p-4 [&_svg]:mx-auto",
        className,
      )}
      aria-label="Diagram"
    />
  );
}
