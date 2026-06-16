import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAllDocSlugs } from "@/lib/docs-content";
import { getSiteUrl } from "@/lib/site-url";

const CONTENT_ROOT = path.join(process.cwd(), "content");

function getDocLastModified(slug: string): Date {
  const filePath = path.join(CONTENT_ROOT, "en", "docs", `${slug}.mdx`);
  if (fs.existsSync(filePath)) {
    return fs.statSync(filePath).mtime;
  }
  return new Date();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  const pages = ["/", ...getAllDocSlugs().map((slug) => `/docs/${slug}`)];

  return pages.map((href) => ({
    url: `${baseUrl}${getPathname({ locale: "en", href })}`,
    lastModified:
      href === "/" ? new Date() : getDocLastModified(href.replace("/docs/", "")),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          `${baseUrl}${getPathname({ locale, href })}`,
        ]),
      ),
    },
  }));
}
