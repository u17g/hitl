import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/docs/concepts/wait-for-human",
        destination: "/docs/foundations/wait-for-human",
        permanent: true,
      },
      {
        source: "/ja/docs/concepts/wait-for-human",
        destination: "/ja/docs/foundations/wait-for-human",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
