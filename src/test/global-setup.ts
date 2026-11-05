import type { TestProject } from "vitest/node";

import { prepareTestDatabase } from "./test-database";

// Runs once before all tests: makes sure the test database exists and has the current schema.

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export async function setup(project: TestProject) {
  const testUrl = await prepareTestDatabase("_test");
  project.provide("testDatabaseUrl", testUrl.toString());
}
