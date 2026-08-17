// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NumberBallLottery } from "../NumberBall";
import { useLatestLotteryDraw } from "../useLatestLotteryDraw";
import { fetchLatestLotteryDraw } from "../lottery-api";

vi.mock("../lottery-api", () => ({
  fetchLatestLotteryDraw: vi.fn(),
}));

const mockedFetchLatestLotteryDraw = vi.mocked(fetchLatestLotteryDraw);

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLatestLotteryDraw", () => {
  it("切換彩種時立即清除上一彩種的開獎資料", async () => {
    mockedFetchLatestLotteryDraw.mockResolvedValueOnce({
      period: "115194",
      drawDate: "2026/08/11",
      numbers: ["02", "14", "25", "29", "36"],
    });
    mockedFetchLatestLotteryDraw.mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ lottery }: { lottery: NumberBallLottery }) => useLatestLotteryDraw(lottery),
      { initialProps: { lottery: "今彩539" as NumberBallLottery } },
    );

    await waitFor(() => expect(result.current.data?.period).toBe("115194"));

    act(() => {
      rerender({ lottery: "六合彩" });
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
