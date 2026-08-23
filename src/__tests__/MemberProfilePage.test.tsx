// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memberApi = vi.hoisted(() => ({ fetchMemberProfile: vi.fn() }));

vi.mock("../member-api", () => ({ fetchMemberProfile: memberApi.fetchMemberProfile }));

import { ProfilePage } from "../FeaturePages";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

beforeEach(() => {
  memberApi.fetchMemberProfile.mockReset().mockResolvedValue({
    lineUserId: "line-real",
    planName: "年費方案",
    planExpiresAt: "2026-09-22T00:00:00.000Z",
    isLifetime: false,
  });
});

describe("ProfilePage member API", () => {
  it("以登入會員 API 資料取代固定 LINE ID、方案與到期日", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T04:00:00.000Z"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("LINE ID：line-real")).toBeInTheDocument();
    expect(screen.getByText("年費方案")).toBeInTheDocument();
    expect(screen.getByText("2026/09/22")).toBeInTheDocument();
    expect(screen.getByText("剩餘 10 天")).toBeInTheDocument();
    expect(screen.queryByText("LINE ID：lottery_matrix")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("終身方案不顯示 API 內的固定到期日", async () => {
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      lineUserId: "line-lifetime",
      planName: "終身方案",
      planExpiresAt: "2027-07-23T00:00:00.000Z",
      isLifetime: true,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("LINE ID：line-lifetime")).toBeInTheDocument());
    expect(screen.queryByText("2027/07/23")).not.toBeInTheDocument();
    expect(screen.queryByText(/剩餘 .* 天/)).not.toBeInTheDocument();
  });

  it("以 Asia/Taipei 日曆日計算跨 UTC 日期邊界的到期日", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T04:00:00.000Z"));
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      lineUserId: "line-taipei",
      planName: "月費方案",
      planExpiresAt: "2026-09-12T16:00:00.000Z",
      isLifetime: false,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("2026/09/13")).toBeInTheDocument();
    expect(screen.getByText("剩餘 1 天")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
