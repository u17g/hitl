import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hitldev/store-sqlite"],
  serverExternalPackages: [
    "hitl",
    "@hitldev/vercel-workflow",
    "workflow",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.extensionAlias = {
        ".js": [".ts", ".js"],
      };
    }
    return config;
  },
};

export default withWorkflow(nextConfig);
