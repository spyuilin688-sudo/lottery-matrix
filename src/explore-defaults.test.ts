import { describe, expect, it } from "vitest";
import { getExploreEntryDefaults } from "./explore-defaults";

describe("getExploreEntryDefaults", () => {
  it.each(["月費方案", "季費方案", "年費方案", "終身方案"])(
    "%s 使用最高可用的十三期與完整範圍",
    (planName) => {
      expect(getExploreEntryDefaults({ planName, isLifetime: planName === "終身方案" }, new Date("2026-08-24T04:00:00Z"))).toEqual({
        period: "十三期",
        range: "完整範圍",
      });
    },
  );

  it.each([
    ["2026-08-25T04:00:00Z", "星期二"],
    ["2026-08-28T04:00:00Z", "星期五"],
  ])("LINE 免費會員於%s進入時預設七期", (timestamp) => {
    expect(getExploreEntryDefaults({ planName: null, isLifetime: false, lineUserId: 'line-member' }, new Date(timestamp))).toEqual({
      period: "七期",
      range: "標準範圍",
    });
  });

  it.each(['2026-08-25T04:00:00Z', '2026-08-28T04:00:00Z'])("訪客於%s仍預設二期", (timestamp) => {
    expect(getExploreEntryDefaults(null, new Date(timestamp))).toEqual({ period: '二期', range: '標準範圍' });
  });

  it('依後端最高權限設定期數和範圍，包括方案以外的既有權限', () => {
    expect(getExploreEntryDefaults({ planName: null, isLifetime: false, lineUserId: 'line-member', exploreEntitlements: { canUseSeven: true, canUseThirteen: false, canUseFullRange: true } })).toEqual({ period: '七期', range: '完整範圍' });
  });

  it('後端權限優先於方案名稱，避免選取已失效的權限', () => {
    expect(getExploreEntryDefaults({ planName: '月費方案', isLifetime: false, exploreEntitlements: { canUseSeven: false, canUseThirteen: false, canUseFullRange: false } })).toEqual({ period: '二期', range: '標準範圍' });
  });

  it("未訂閱者在其他日期預設二期", () => {
    expect(getExploreEntryDefaults(null, new Date("2026-08-24T04:00:00Z"))).toEqual({
      period: "二期",
      range: "標準範圍",
    });
  });

  it("已到期方案不取得 Matrix Pro 預設", () => {
    expect(getExploreEntryDefaults(
      { planName: "月費方案", isLifetime: false, planExpiresAt: "2026-08-23T15:59:59Z" },
      new Date("2026-08-24T04:00:00Z"),
    )).toEqual({ period: "二期", range: "標準範圍" });
  });
});
