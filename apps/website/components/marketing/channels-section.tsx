import { Inbox, MessageSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function ChannelsSection() {
  const t = await getTranslations("channels");

  const channels = [
    { key: "slack", icon: MessageSquare },
    { key: "teams", icon: MessageSquare },
    { key: "discord", icon: MessageSquare },
    { key: "inbox", icon: Inbox },
  ] as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {channels.map(({ key, icon: Icon }) => (
          <Card key={key} className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <Icon className="mb-2 h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{t(key)}</CardTitle>
              <CardDescription>{t(`${key}Desc`)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
