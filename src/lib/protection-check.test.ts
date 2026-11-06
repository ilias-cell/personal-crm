import { expect, test } from "vitest";

// Deliberately failing test: checks that branch protection blocks a PR with red CI. Never merge.
test("deliberately fails", () => {
  expect(1 + 1).toBe(3);
});
