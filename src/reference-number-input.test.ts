import { describe, expect, it } from "vitest";
import { formatReferenceNumber, sanitizeReferenceNumber } from "./reference-number-input";

describe("號碼對照單輸入", () => {
  it("只保留 01 到 49 的有效輸入", () => {
    expect(sanitizeReferenceNumber("4a9")).toBe("49");
    expect(sanitizeReferenceNumber("50")).toBe("");
    expect(sanitizeReferenceNumber("00")).toBe("");
  });

  it("輸入完成後將一位數補成兩位數", () => {
    expect(formatReferenceNumber("1")).toBe("01");
    expect(formatReferenceNumber("9")).toBe("09");
    expect(formatReferenceNumber("49")).toBe("49");
  });
});
