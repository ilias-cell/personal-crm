import { describe, expect, it } from "vitest";

import { GROUP_NAME_MAX_LENGTH } from "@/lib/group-form";
import { EMAIL_MAX_LENGTH } from "@/lib/contact-form";
import { groupNameSchema, loginEmailSchema } from "@/lib/validation";

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

describe("login email", () => {
  it("trims spaces and lower-cases the letters", () => {
    expect(loginEmailSchema.parse("  Anna@Example.COM  ")).toBe("anna@example.com");
  });

  it.each(["anna@", "anna", "@example.com", "anna@example", "anna example@example.com"])(
    "rejects %j as not an email",
    (value) => {
      const result = loginEmailSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
    },
  );

  it.each(["", "   "])("rejects an empty field (%j)", (value) => {
    const result = loginEmailSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
  });

  it("rejects an address that is too long, with the same message", () => {
    const tooLong = `${"a".repeat(EMAIL_MAX_LENGTH)}@example.com`;
    const result = loginEmailSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
  });

  it("rejects something that is not a string", () => {
    expect(loginEmailSchema.safeParse(undefined).success).toBe(false);
    expect(loginEmailSchema.safeParse(42).success).toBe(false);
  });
});
