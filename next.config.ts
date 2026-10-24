import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Self-contained server for the Docker image: .next/standalone runs without installing node_modules.
  output: "standalone",
  // The deploy runs migrations and the seed from the same image (src/db/migrate.ts, seed.ts, compiled to CommonJS).
  // The app bundles drizzle-orm into its own build, so the package itself would be left out of the standalone
  // node_modules. These files are what those scripts load at runtime.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/drizzle-orm/package.json", "./node_modules/drizzle-orm/**/*.cjs"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
