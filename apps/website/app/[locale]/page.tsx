import { ArchitectureSection } from "@/components/marketing/architecture-section";
import { ChannelsSection } from "@/components/marketing/channels-section";
import { CodeComparison } from "@/components/marketing/code-comparison";
import { CtaSection } from "@/components/marketing/cta-section";
import { Hero } from "@/components/marketing/hero";
import { LogoStrip } from "@/components/marketing/logo-strip";
import { SetupSection } from "@/components/marketing/setup-section";
import { StackSection } from "@/components/marketing/stack-section";
import { SectionSpacer } from "@/components/section";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl border-x border-border">
      <Hero />
      <SectionSpacer />
      <LogoStrip />
      <SectionSpacer />
      <CodeComparison />
      <SectionSpacer />
      <ChannelsSection />
      <SectionSpacer />
      <StackSection />
      <SectionSpacer />
      <CtaSection />
      <SectionSpacer className="border-b-0" />
    </div>
  );
}
