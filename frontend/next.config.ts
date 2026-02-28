import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (default in Next.js 16) — resolve Node-only modules
  // referenced by Dynamic SDK / viem dependencies
  turbopack: {
    resolveAlias: {
      "pino-pretty": { browser: "" },
      encoding: { browser: "" },
    },
  },
};

export default nextConfig;
