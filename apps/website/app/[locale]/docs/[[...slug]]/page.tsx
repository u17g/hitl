import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { setRequestLocale } from "next-intl/server";
import { DocPager } from "@/components/docs/doc-pager";
import { DocsProse, mdxComponents } from "@/components/docs/mdx-components";
import { type Locale, routing } from "@/i18n/routing";
import { getAllDocSlugs, getDocSource } from "@/lib/docs-content";
import { getAdjacentDocs, getDocTitle } from "@/lib/docs";

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

function resolveSlug(slugParts?: string[]): string {
  if (!slugParts || slugParts.length === 0) return "overview";
  return slugParts.join("/");
}

export function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({
      locale,
      slug: slug.split("/"),
    })),
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { locale, slug: slugParts } = await params;
  const slug = resolveSlug(slugParts);
  const doc = getDocSource(locale as Locale, slug);

  if (!doc) return {};

  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { locale, slug: slugParts } = await params;
  setRequestLocale(locale);

  const slug = resolveSlug(slugParts);
  const doc = getDocSource(locale as Locale, slug);

  if (!doc) {
    notFound();
  }

  const { content } = await compileMDX({
    source: doc.content,
    components: mdxComponents,
  });

  const { prev, next } = getAdjacentDocs(slug);

  return (
    <div className="space-y-8">
      <DocsProse>{content}</DocsProse>
      <DocPager
        prev={
          prev
            ? { slug: prev.slug, title: getDocTitle(prev.slug, locale as Locale) }
            : undefined
        }
        next={
          next
            ? { slug: next.slug, title: getDocTitle(next.slug, locale as Locale) }
            : undefined
        }
      />
    </div>
  );
}
