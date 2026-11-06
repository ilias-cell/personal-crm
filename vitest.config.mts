import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: `${import.meta.dirname}/src` },
      { find: "server-only", replacement: `${import.meta.dirname}/src/test/empty-module.ts` },
    ],
  },
  test: {
    environment: "node",
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    // All test files share one database, so they run one after another.
    fileParallelism: false,
  },
});
