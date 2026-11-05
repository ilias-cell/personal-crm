import { describe, expect, it } from "vitest";

import { GROUP_NAME_MAX_LENGTH } from "@/lib/group-form";
import { groupNameSchema } from "@/lib/validation";

describe("group name", () => {
  it("rejects an empty name", () => {
    const result = groupNameSchema.safeParse("");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Укажите название группы");
  });

  it("rejects a name made of spaces only", () => {
    const result = groupNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Укажите название группы");
  });

  it("accepts a name of 40 characters", () => {
    expect(GROUP_NAME_MAX_LENGTH).toBe(40);
    expect(groupNameSchema.safeParse("а".repeat(40)).success).toBe(true);
  });

  it("rejects a name of 41 characters", () => {
    const result = groupNameSchema.safeParse("а".repeat(41));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Название — не длиннее 40 символов");
  });

  it("trims spaces around the name", () => {
    expect(groupNameSchema.parse("  Теннис  ")).toBe("Теннис");
  });

  it("counts the length after trimming", () => {
    expect(groupNameSchema.safeParse(`  ${"а".repeat(40)}  `).success).toBe(true);
  });
});
