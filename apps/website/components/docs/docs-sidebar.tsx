"use client";

import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { docPages } from "@/lib/docs";
import { cn } from "@/lib/utils";

export function DocsSidebar() {
  const pathname = usePathname();
  const t = useInlineTranslation();

  return (
    <nav className="space-y-1">
      <p className="mb-3 text-sm font-semibold">
        {t({ en: "Documentation", ja: "ドキュメント" })}
      </p>
      {docPages.map((page) => {
        const href = `/docs/${page.slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={page.slug}
            href={href}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
              active && "bg-accent font-medium",
            )}
          >
            {t(page.title)}
          </Link>
        );
      })}
    </nav>
  );
}
