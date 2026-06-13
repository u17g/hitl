import { getTranslations } from "next-intl/server";
import { ArchitectureDiagram } from "@/components/marketing/architecture-diagram";

export async function ArchitectureSection() {
  const t = await getTranslations("architecture");

  const points = [t("point1"), t("point2"), t("point3")];

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:items-center">
        <ArchitectureDiagram />
        <ol className="space-y-4">
          {points.map((point, i) => (
            <li key={point} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium">
                {i + 1}
              </span>
              <p className="pt-1 text-muted-foreground">{point}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
