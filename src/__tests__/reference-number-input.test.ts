import { describe, expect, it } from "vitest";
import { formatReferenceNumber, sanitizeReferenceNumber } from "../reference-number-input";

describe("reference number input", () => {
  it("允許 01 到 09 先輸入前導 0", () => {
    expect(sanitizeReferenceNumber("0")).toBe("0");
    expect(sanitizeReferenceNumber("01")).toBe("01");
    expect(sanitizeReferenceNumber("09")).toBe("09");
  });

  it("單獨的 0 在離開輸入框時不會格式化成 00", () => {
    expect(formatReferenceNumber("0")).toBe("");
  });

  it("仍只接受 01 到 49", () => {
    expect(formatReferenceNumber("1")).toBe("01");
    expect(formatReferenceNumber("49")).toBe("49");
    expect(sanitizeReferenceNumber("50")).toBe("");
  });
});
