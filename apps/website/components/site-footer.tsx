import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Separator } from "@/components/ui/separator";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Hitl SDK</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("tagline")}</p>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/docs/getting-started" className="hover:text-foreground">
              {nav("docs")}
            </Link>
            <a
              href="https://github.com/hitldev/hitldev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {nav("github")}
            </a>
            <a
              href="https://www.npmjs.com/package/hitl"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {nav("npm")}
            </a>
          </nav>
        </div>
        <Separator className="my-6" />
        <p className="text-sm text-muted-foreground">{t("license")}</p>
      </div>
    </footer>
  );
}
