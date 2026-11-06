import { defineConfig, devices } from "@playwright/test";

import { testDatabaseUrl } from "./src/test/test-database";

// End-to-end tests: a real browser against the built app and a real database in Docker.
// The app runs on its own port with its own database ("<name>_e2e"), so working data and a running `pnpm dev` stay untouched.
const PORT = 3002;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // All tests share one database, so they run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Database first, then the production build run the same way as in the Dockerfile.
    // Built on every run, so the tests always see the current code.
    command: [
      "pnpm exec tsx e2e/prepare-database.ts",
      "pnpm build",
      "cp -R .next/static .next/standalone/.next/",
      "node .next/standalone/server.js",
    ].join(" && "),
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: testDatabaseUrl("_e2e").toString(),
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
  },
});
