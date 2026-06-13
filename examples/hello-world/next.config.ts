import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "hitl",
    "@hitl/resolver-workflow-sdk",
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
