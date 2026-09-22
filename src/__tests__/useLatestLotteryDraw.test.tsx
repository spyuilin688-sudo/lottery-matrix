// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NumberBallLottery } from "../NumberBall";
import { useLatestLotteryDraw } from "../useLatestLotteryDraw";
import { fetchLatestLotteryDraw, type LotteryDrawRecord } from "../lottery-api";

vi.mock("../lottery-api", () => ({
  fetchLatestLotteryDraw: vi.fn(),
}));

const mockedFetchLatestLotteryDraw = vi.mocked(fetchLatestLotteryDraw);

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLatestLotteryDraw", () => {
  it("切換彩種的每次 render 都不暴露上一彩種資料", async () => {
    mockedFetchLatestLotteryDraw.mockResolvedValueOnce({
      period: "old-539", drawDate: "2026/09/19", numbers: ["02", "17", "27", "29", "35"],
    }).mockImplementationOnce(() => new Promise(() => {}));
    const observed: Array<{ lottery: NumberBallLottery; period: string | null }> = [];
    const { result, rerender } = renderHook(({ lottery }: { lottery: NumberBallLottery }) => {
      const state = useLatestLotteryDraw(lottery);
      observed.push({ lottery, period: state.data?.period ?? null });
      return state;
    }, { initialProps: { lottery: "今彩539" as NumberBallLottery } });
    await waitFor(() => expect(result.current.data?.period).toBe("old-539"));
    rerender({ lottery: "天天樂" });
    expect(observed.filter(row => row.lottery === "天天樂").every(row => row.period === null)).toBe(true);
  });

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

  it("快速切換彩種時忽略上一彩種較晚回傳的資料", async () => {
    let resolveOld!: (record: LotteryDrawRecord) => void;
    let resolveCurrent!: (record: LotteryDrawRecord) => void;
    mockedFetchLatestLotteryDraw
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));

    const { result, rerender } = renderHook(
      ({ lottery }: { lottery: NumberBallLottery }) => useLatestLotteryDraw(lottery),
      { initialProps: { lottery: "今彩539" as NumberBallLottery } },
    );

    await waitFor(() => expect(mockedFetchLatestLotteryDraw).toHaveBeenCalledWith("今彩539"));

    act(() => {
      rerender({ lottery: "六合彩" });
    });
    await waitFor(() => expect(mockedFetchLatestLotteryDraw).toHaveBeenCalledWith("六合彩"));

    await act(async () => {
      resolveCurrent({ period: "current", drawDate: "2026/08/17", numbers: ["01", "02", "03", "04", "05", "06", "07"] });
    });
    await waitFor(() => expect(result.current.data?.period).toBe("current"));

    await act(async () => {
      resolveOld({ period: "old", drawDate: "2026/08/16", numbers: ["11", "12", "13", "14", "15"] });
    });

    expect(result.current.data?.period).toBe("current");
  });

  it("can disable the shared hourly subscription when a parent coordinator owns refresh timing", async () => {
    const { result } = renderHook(() => useLatestLotteryDraw("今彩539", { subscribeToRefresh: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(subscribeLotteryRefresh).not.toHaveBeenCalled();
    await act(async () => { await result.current.refresh(); });
    expect(fetchLatestLotteryDraw).toHaveBeenCalledTimes(2);
  });
});
