"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { docPages } from "@/lib/docs";
import { cn } from "@/lib/utils";

export function DocsSidebar() {
  const pathname = usePathname();
  const t = useTranslations("docs");

  return (
    <nav className="space-y-1">
      <p className="mb-3 text-sm font-semibold">{t("title")}</p>
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
            {t(page.titleKey)}
          </Link>
        );
      })}
    </nav>
  );
}
