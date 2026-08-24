// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const memberApi = vi.hoisted(() => ({ fetchMemberProfile: vi.fn() }));
const lineAuth = vi.hoisted(() => ({ signOutFromMatrix: vi.fn() }));

vi.mock("../member-api", () => ({ fetchMemberProfile: memberApi.fetchMemberProfile }));
vi.mock("../auth/line-auth", () => ({ signOutFromMatrix: lineAuth.signOutFromMatrix }));

import { ProfilePage } from "../FeaturePages";

const style = document.createElement("style");

beforeAll(() => {
  style.textContent = readFileSync(`${process.cwd()}/src/feature-pages.css`, "utf8");
  document.head.append(style);
});

afterAll(() => {
  style.remove();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

beforeEach(() => {
  lineAuth.signOutFromMatrix.mockReset().mockResolvedValue(undefined);
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

  it("由既有登出按鈕直接處理 pending、失敗提示與重試", async () => {
    let rejectLogout!: (reason: Error) => void;
    lineAuth.signOutFromMatrix.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectLogout = reject;
    }));
    render(<ProfilePage onNavigate={vi.fn()} />);
    const logout = screen.getByRole("button", { name: "登出" });
    const feedback = document.querySelector<HTMLElement>(".profile-logout-error");

    expect(feedback).toBeInTheDocument();
    expect(feedback).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getComputedStyle(feedback!).visibility).toBe("hidden");
    expect(getComputedStyle(feedback!).minHeight).toBe("16px");
    expect(getComputedStyle(feedback!).marginTop).toBe("-4px");
    expect(getComputedStyle(feedback!).color).toBe("rgb(207, 119, 119)");
    expect(getComputedStyle(feedback!).fontSize).toBe("11px");

    fireEvent.click(logout);

    expect(logout).toBeDisabled();
    expect(logout).toHaveAttribute("aria-busy", "true");
    expect(lineAuth.signOutFromMatrix).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectLogout(new Error("private logout detail"));
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toBe(feedback);
    expect(alert).toHaveTextContent("登出失敗，請稍後再試");
    expect(getComputedStyle(alert).visibility).toBe("visible");
    expect(logout).toBeEnabled();
    expect(logout).toHaveAttribute("aria-busy", "false");

    fireEvent.click(logout);
    await waitFor(() => expect(lineAuth.signOutFromMatrix).toHaveBeenCalledTimes(2));
  });
});
