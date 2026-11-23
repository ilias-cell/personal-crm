import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP without a nonce: a nonce needs every page rendered per request, which does not fit cacheComponents.
// So inline scripts and styles (the ones Next.js itself puts into the page) are allowed with 'unsafe-inline'.
// 'unsafe-eval' is only for the dev server (React uses eval there). No upgrade-insecure-requests: it would break
// the local http addresses; in production HSTS does the job.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Do not announce the framework in the X-Powered-By header.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
