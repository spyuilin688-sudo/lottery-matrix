import { describe, expect, it } from "vitest";
import { subscriptionPlanCode } from "./subscription-plan-crown";

describe("subscriptionPlanCode", () => {
  it("maps the three paid plan names to their crown artwork", () => {
    expect(subscriptionPlanCode("月費方案")).toBe("month");
    expect(subscriptionPlanCode("季費方案")).toBe("quarter");
    expect(subscriptionPlanCode("年費方案")).toBe("year");
  });

  it("keeps free and unknown plans on the existing crown", () => {
    expect(subscriptionPlanCode("免費會員")).toBeNull();
    expect(subscriptionPlanCode("其他方案")).toBeNull();
    expect(subscriptionPlanCode(null)).toBeNull();
  });
});
