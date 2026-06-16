import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/docs/concepts/wait-for-human",
        destination: "/docs/foundations/human-steps",
        permanent: true,
      },
      {
        source: "/ja/docs/concepts/wait-for-human",
        destination: "/ja/docs/foundations/human-steps",
        permanent: true,
      },
      {
        source: "/docs/foundations/wait-for-human",
        destination: "/docs/foundations/human-steps",
        permanent: true,
      },
      {
        source: "/ja/docs/foundations/wait-for-human",
        destination: "/ja/docs/foundations/human-steps",
        permanent: true,
      },
      {
        source: "/docs/foundations/request-human",
        destination: "/docs/foundations/human-steps",
        permanent: true,
      },
      {
        source: "/ja/docs/foundations/request-human",
        destination: "/ja/docs/foundations/human-steps",
        permanent: true,
      },
      {
        source: "/docs/foundations/notify",
        destination: "/docs/foundations/notifications",
        permanent: true,
      },
      {
        source: "/ja/docs/foundations/notify",
        destination: "/ja/docs/foundations/notifications",
        permanent: true,
      },
      {
        source: "/docs/foundations/reminders",
        destination: "/docs/foundations/timeouts-and-reminders",
        permanent: true,
      },
      {
        source: "/ja/docs/foundations/reminders",
        destination: "/ja/docs/foundations/timeouts-and-reminders",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
