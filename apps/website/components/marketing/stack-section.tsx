import { getTranslations } from "next-intl/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function StackSection() {
  const t = await getTranslations("stack");

  const items = [
    { key: "aiSdk", label: "AI SDK" },
    { key: "wdk", label: "Workflow DevKit" },
  ] as const;

  return (
    <section className="border-y bg-muted/30 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {items.map(({ key, label }) => (
            <Card key={key} className="border bg-background">
              <CardHeader>
                <CardTitle className="text-2xl">{label}</CardTitle>
                <CardDescription className="text-base">
                  {t(`${key}Desc`)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
