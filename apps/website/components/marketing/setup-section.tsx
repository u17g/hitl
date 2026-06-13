import { getTranslations } from "next-intl/server";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { snippets } from "@/lib/snippets";

export async function SetupSection() {
  const t = await getTranslations("setup");

  const steps = [
    {
      title: t("step1Title"),
      desc: t("step1Desc"),
      code: snippets.install,
      filename: "terminal",
    },
    {
      title: t("step2Title"),
      desc: t("step2Desc"),
      code: snippets.workflowUsage,
      filename: "workflows/inbound-lead.ts",
    },
    {
      title: t("step3Title"),
      desc: t("step3Desc"),
      code: snippets.serverSetup,
      filename: "lib/hitl.ts",
    },
  ];

  return (
    <section className="border-y bg-muted/30 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title} className="border bg-background">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </div>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock code={step.code} filename={step.filename} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
