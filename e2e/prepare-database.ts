import { prepareTestDatabase } from "../src/test/test-database";

// Makes sure the e2e database exists and has the current schema.
// Runs as the first step of the web server command: Playwright starts the server before any global setup,
// and the server's /health check needs the database.
prepareTestDatabase("_e2e").catch((error) => {
  console.error("Failed to prepare the e2e database:", error);
  process.exitCode = 1;
});
