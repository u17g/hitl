import { setRequestLocale } from "next-intl/server";
import { ArchitectureSection } from "@/components/marketing/architecture-section";
import { ChannelsSection } from "@/components/marketing/channels-section";
import { CodeComparison } from "@/components/marketing/code-comparison";
import { CtaSection } from "@/components/marketing/cta-section";
import { Hero } from "@/components/marketing/hero";
import { SetupSection } from "@/components/marketing/setup-section";
import { StackSection } from "@/components/marketing/stack-section";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <CodeComparison />
      <SetupSection />
      <ChannelsSection />
      <StackSection />
      <ArchitectureSection />
      <CtaSection />
    </>
  );
}
