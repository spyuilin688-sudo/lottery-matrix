// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const memberApi = vi.hoisted(() => ({ bootstrapMember: vi.fn(), fetchMemberProfile: vi.fn() }));
const lineAuth = vi.hoisted(() => ({
  signInWithLine: vi.fn(),
  signOutFromMatrix: vi.fn(),
  reconcilePendingLineLogoutPresence: vi.fn(),
}));
const appDialog = vi.hoisted(() => ({ confirm: vi.fn(), alert: vi.fn() }));
const pwaLifecycle = vi.hoisted(() => ({ usePwaLifecycle: vi.fn() }));
const supabase = vi.hoisted(() => {
  const unsubscribe = vi.fn();
  let authStateListener: ((event: string, session: unknown) => void) | null = null;
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn((listener: (event: string, session: unknown) => void) => {
      authStateListener = listener;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  return {
    auth,
    emitAuthState: (event: string, session: unknown) => authStateListener?.(event, session),
    getClient: vi.fn(() => ({ auth })),
    resetAuthStateListener: () => { authStateListener = null; },
    unsubscribe,
  };
});

vi.mock("../member-api", () => ({
  bootstrapMember: memberApi.bootstrapMember,
  fetchMemberProfile: memberApi.fetchMemberProfile,
}));
vi.mock("../auth/line-auth", () => ({
  signInWithLine: lineAuth.signInWithLine,
  signOutFromMatrix: lineAuth.signOutFromMatrix,
  reconcilePendingLineLogoutPresence: lineAuth.reconcilePendingLineLogoutPresence,
}));
vi.mock("../lib/supabase", () => ({ getSupabaseClient: supabase.getClient }));
vi.mock("../dialog/AppDialog", () => ({ useAppDialog: () => appDialog }));
vi.mock("../pwa-lifecycle", () => ({ usePwaLifecycle: pwaLifecycle.usePwaLifecycle }));

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
  window.history.replaceState({}, "", "/");
  cleanup();
});

beforeEach(() => {
  window.sessionStorage.clear();
  lineAuth.signInWithLine.mockReset().mockResolvedValue(undefined);
  lineAuth.signOutFromMatrix.mockReset().mockResolvedValue(undefined);
  lineAuth.reconcilePendingLineLogoutPresence.mockReset();
  appDialog.confirm.mockReset().mockResolvedValue(true);
  appDialog.alert.mockReset().mockResolvedValue(undefined);
  pwaLifecycle.usePwaLifecycle.mockReset().mockReturnValue({
    isInstalled: false,
    showInstallAction: false,
    requestInstall: vi.fn().mockResolvedValue("unavailable"),
  });
  supabase.unsubscribe.mockReset();
  supabase.resetAuthStateListener();
  supabase.getClient.mockClear();
  supabase.auth.onAuthStateChange.mockClear();
  supabase.auth.getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: "member-session" } },
    error: null,
  });
  memberApi.fetchMemberProfile.mockReset().mockResolvedValue({
    lineUserId: "line-real",
    planName: "年費方案",
    planExpiresAt: "2026-09-22T00:00:00.000Z",
    isLifetime: false,
  });
  memberApi.bootstrapMember.mockReset().mockResolvedValue({
    memberId: "member-real",
    lineUserId: "line-real",
  });
});

describe("ProfilePage member API", () => {
  it("moves the combined support entry below legal information and removes its duplicate entries", () => {
    render(<ProfilePage onNavigate={vi.fn()} />);

    const menuTitles = Array.from(document.querySelectorAll<HTMLElement>(".profile-menu > .section-title"))
      .map((title) => title.textContent?.trim());
    expect(menuTitles).toEqual(["會員相關", "推廣相關", "系統相關", "法律資訊", "客服與支援"]);
    expect(screen.getByRole("button", { name: "聯絡客服/問題回報/商務合作" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "問題回報" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "商務合作" })).not.toBeInTheDocument();
  });

  it("在系統相關區顯示安裝入口，iOS 點擊後使用共用加入主畫面指引", async () => {
    const requestInstall = vi.fn().mockResolvedValue("ios-instructions");
    pwaLifecycle.usePwaLifecycle.mockReturnValue({
      isInstalled: false,
      showInstallAction: true,
      requestInstall,
    });
    render(<ProfilePage onNavigate={vi.fn()} />);

    const install = screen.getByRole("button", { name: "安裝 樂彩 Matrix" });
    expect(install.closest("section")).toHaveTextContent("系統相關");

    fireEvent.click(install);

    await waitFor(() => expect(requestInstall).toHaveBeenCalledTimes(1));
    expect(appDialog.alert).toHaveBeenCalledWith({
      title: "加入主畫面",
      description: "請點選瀏覽器的分享按鈕，再選擇「加入主畫面」。",
    });
  });

  it("我的頁面使用正式標題卡", () => {
    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(screen.getByRole("img", { name: "我的" })).toHaveAttribute(
      "src",
      "/assets/lottery/functions/我的標題K.png",
    );
  });

  it("未登入時在既有會員卡顯示 LINE 登入並啟動登入流程", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    render(<ProfilePage onNavigate={vi.fn()} />);

    const login = await screen.findByRole("button", { name: "LINE 登入" });
    expect(screen.queryByRole("button", { name: "登出" })).not.toBeInTheDocument();
    expect(memberApi.bootstrapMember).not.toHaveBeenCalled();
    expect(memberApi.fetchMemberProfile).not.toHaveBeenCalled();

    fireEvent.click(login);

    const signingIn = screen.getByRole("button", { name: "登入中…" });
    expect(signingIn).toBe(login);
    expect(signingIn).toBeDisabled();
    expect(signingIn).toHaveAttribute("aria-busy", "true");
    expect(lineAuth.signInWithLine).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(login).toBeEnabled());
    expect(JSON.parse(window.sessionStorage.getItem("matrix-line-login-pending") ?? "null")).toEqual({
      startedAt: expect.any(Number),
    });
  });

  it("LINE 登入失敗時使用共用危險提示，而不是頁內錯誤文字", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    lineAuth.signInWithLine.mockRejectedValueOnce(new Error("private oauth detail"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "LINE 登入" }));

    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({
      title: "登入失敗",
      description: "請稍後再試。",
      tone: "danger",
    }));
    expect(document.querySelector(".profile-logout-error")).toBeNull();
  });

  it("登入錯誤即使與 logout uncertain code 同名也維持 anonymous", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    lineAuth.signInWithLine.mockRejectedValueOnce(new Error("SUPABASE_SIGN_OUT_UNCERTAIN"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "LINE 登入" }));

    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({
      title: "登入失敗",
      description: "請稍後再試。",
      tone: "danger",
    }));
    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新檢查" })).not.toBeInTheDocument();
  });

  it("OAuth 回到頁面並取得 session 後只顯示一次登入成功提示", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const first = render(<ProfilePage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "LINE 登入" }));
    await waitFor(() => expect(lineAuth.signInWithLine).toHaveBeenCalledTimes(1));
    first.unmount();

    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: "returned-member-session" } },
      error: null,
    });
    render(<ProfilePage onNavigate={vi.fn()} />);

    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({ title: "登入成功", tone: "success" }));
    expect(window.sessionStorage.getItem("matrix-line-login-pending")).toBeNull();
  });

  it("舊格式、逾期或 callback error 的登入標記不顯示成功且會清除", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    const cases = [
      { stored: "1", callback: "/" },
      { stored: JSON.stringify({ startedAt: Date.now() - 600_000 }), callback: "/" },
      { stored: JSON.stringify({ startedAt: Date.now() - 1_000 }), callback: "/?error=access_denied" },
    ];

    for (const { stored, callback } of cases) {
      window.sessionStorage.setItem("matrix-line-login-pending", stored);
      window.history.replaceState({}, "", callback);
      const view = render(<ProfilePage onNavigate={vi.fn()} />);
      await act(async () => { await Promise.resolve(); });

      expect(appDialog.alert).not.toHaveBeenCalledWith({ title: "登入成功", tone: "success" });
      expect(window.sessionStorage.getItem("matrix-line-login-pending")).toBeNull();

      view.unmount();
      appDialog.alert.mockClear();
    }
  });

  it("初始化期間不顯示可誤操作的登入或登出按鈕", () => {
    supabase.auth.getSession.mockReturnValueOnce(new Promise(() => undefined));

    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /LINE 登入|登出|重新檢查/ })).not.toBeInTheDocument();
  });

  it("重新檢查期間保留同一按鈕的 DOM、幾何與焦點", async () => {
    let resolveRetry!: (result: {
      data: { session: { access_token: string } };
      error: null;
    }) => void;
    const recoveredSession = { access_token: "recovered-session" };
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("private read detail") })
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRetry = resolve;
      }));
    render(<ProfilePage onNavigate={vi.fn()} />);

    const retry = await screen.findByRole("button", { name: "重新檢查" });
    expect(screen.queryByRole("button", { name: "LINE 登入" })).not.toBeInTheDocument();
    expect(retry).toHaveClass("profile-logout");
    const geometry = retry.getBoundingClientRect();
    retry.focus();
    expect(document.activeElement).toBe(retry);

    fireEvent.click(retry);

    const busyRetry = screen.getByRole("button", { name: "重新檢查" });
    expect(busyRetry).toBe(retry);
    expect(busyRetry).toHaveClass("profile-logout");
    expect(busyRetry).toBeDisabled();
    expect(busyRetry).toHaveAttribute("aria-busy", "true");
    expect(busyRetry.getBoundingClientRect()).toEqual(geometry);
    expect(document.activeElement).toBe(retry);

    await act(async () => {
      resolveRetry({ data: { session: recoveredSession }, error: null });
    });

    expect(await screen.findByRole("button", { name: "登出" })).toBe(retry);
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(2);
    expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(recoveredSession);
  });

  it("重新檢查確認 null session 時清除 pending presence", async () => {
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("private initial read detail") })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重新檢查" }));

    expect(await screen.findByRole("button", { name: "LINE 登入" })).toBeInTheDocument();
    expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(null);
  });

  it("重新檢查結果未知時保留 paused presence", async () => {
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("private initial read detail") })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("private retry detail") });
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重新檢查" }));

    expect(await screen.findByRole("button", { name: "重新檢查" })).toBeEnabled();
    expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(undefined);
  });

  it("重新檢查期間 auth event 先確認 session 時仍恢復 pending presence", async () => {
    const recoveredSession = { access_token: "event-recovered-session" };
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("private initial read detail") })
      .mockReturnValueOnce(new Promise(() => undefined));
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重新檢查" }));
    act(() => { supabase.emitAuthState("TOKEN_REFRESHED", recoveredSession); });

    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
    expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(recoveredSession);
  });

  it.each(["TOKEN_REFRESHED", "SIGNED_IN"])(
    "未點重新檢查前 %s 仍恢復 pending presence，且 stale getSession 不倒退 UI",
    async (event) => {
      let resolveInitialRead!: (result: { data: { session: null }; error: null }) => void;
      const recoveredSession = { access_token: `${event.toLowerCase()}-session` };
      supabase.auth.getSession.mockReturnValueOnce(new Promise((resolve) => {
        resolveInitialRead = resolve;
      }));
      render(<ProfilePage onNavigate={vi.fn()} />);

      act(() => { supabase.emitAuthState(event, recoveredSession); });

      const logout = screen.getByRole("button", { name: "登出" });
      expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(recoveredSession);

      await act(async () => {
        resolveInitialRead({ data: { session: null }, error: null });
      });

      expect(screen.getByRole("button", { name: "登出" })).toBe(logout);
      expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledTimes(1);
    },
  );

  it("remount 後首次成功 session read 仍恢復 pending presence", async () => {
    const recoveredSession = { access_token: "remounted-session" };
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: new Error("private initial read detail") })
      .mockResolvedValueOnce({ data: { session: recoveredSession }, error: null });
    const initialView = render(<ProfilePage onNavigate={vi.fn()} />);
    await screen.findByRole("button", { name: "重新檢查" });
    initialView.unmount();
    lineAuth.reconcilePendingLineLogoutPresence.mockClear();

    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "登出" })).toBeInTheDocument();
    expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(recoveredSession);
  });

  it("INITIAL_SESSION(null) 先到時仍以 explicit getSession 錯誤進入 degraded", async () => {
    let resolveSessionRead!: (result: { data: { session: null }; error: Error }) => void;
    supabase.auth.getSession.mockReturnValueOnce(new Promise((resolve) => {
      resolveSessionRead = resolve;
    }));
    render(<ProfilePage onNavigate={vi.fn()} />);

    act(() => { supabase.emitAuthState("INITIAL_SESSION", null); });
    expect(screen.queryByRole("button", { name: "LINE 登入" })).not.toBeInTheDocument();

    await act(async () => {
      resolveSessionRead({ data: { session: null }, error: new Error("private initial read detail") });
    });

    expect(screen.getByRole("button", { name: "重新檢查" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "LINE 登入" })).not.toBeInTheDocument();

    act(() => { supabase.emitAuthState("INITIAL_SESSION", null); });
    expect(screen.getByRole("button", { name: "重新檢查" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "LINE 登入" })).not.toBeInTheDocument();
  });

  it("初始化讀取期間仍接受正常 SIGNED_IN 與 SIGNED_OUT 更新", async () => {
    let resolveSessionRead!: (result: { data: { session: null }; error: Error }) => void;
    supabase.auth.getSession.mockReturnValueOnce(new Promise((resolve) => {
      resolveSessionRead = resolve;
    }));
    render(<ProfilePage onNavigate={vi.fn()} />);

    act(() => { supabase.emitAuthState("SIGNED_IN", { access_token: "event-session" }); });
    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();

    act(() => { supabase.emitAuthState("SIGNED_OUT", null); });
    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();

    await act(async () => {
      resolveSessionRead({ data: { session: null }, error: new Error("stale initial read") });
    });
    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();
  });

  it("SIGNED_OUT 即使攜帶 stale session payload 也強制 anonymous", async () => {
    const staleSession = {
      access_token: "stale-signed-out-session",
      user: { user_metadata: { picture: "https://profile.line-scdn.net/stale-avatar" } },
    };
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: staleSession }, error: null });
    render(<ProfilePage onNavigate={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "登出" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "LINE 頭貼" })).toBeInTheDocument();

    act(() => { supabase.emitAuthState("SIGNED_OUT", staleSession); });

    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Matrix 預設頭貼" })).toBeInTheDocument();
    expect(lineAuth.reconcilePendingLineLogoutPresence).toHaveBeenCalledWith(null);
  });

  it("getSession 永不完成時在 2.5 秒後進入 degraded", async () => {
    vi.useFakeTimers();
    supabase.auth.getSession.mockReturnValueOnce(new Promise(() => undefined));
    render(<ProfilePage onNavigate={vi.fn()} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_499); });
    expect(screen.queryByRole("button", { name: "重新檢查" })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(screen.getByRole("button", { name: "重新檢查" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "LINE 登入" })).not.toBeInTheDocument();
  });

  it("已登入時維持既有登出按鈕且不顯示 LINE 登入", async () => {
    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "登出" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "LINE 登入" })).not.toBeInTheDocument();
  });

  it("LINE 有頭貼時顯示 LINE 頭貼", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "member-session",
          user: { user_metadata: { picture: "https://profile.line-scdn.net/member-avatar" } },
        },
      },
      error: null,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByRole("img", { name: "LINE 頭貼" })).toHaveAttribute(
      "src",
      "https://profile.line-scdn.net/member-avatar",
    );
  });

  it("LINE 沒有頭貼時顯示 Matrix 預設頭貼", async () => {
    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByRole("img", { name: "Matrix 預設頭貼" })).toHaveAttribute(
      "src",
      "/assets/lottery/matrix-profile-avatar.jpg",
    );
  });

  it("顯示 LINE 暱稱，長暱稱在固定框內縮小並省略", async () => {
    const nickname = "這是一個很長的 LINE 會員暱稱";
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "member-session",
          user: { user_metadata: { name: nickname } },
        },
      },
      error: null,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    const nicknameFrame = await screen.findByText(`LINE 暱稱：${nickname}`);
    expect(screen.queryByText(/LINE ID：/)).not.toBeInTheDocument();
    expect(nicknameFrame).toHaveAttribute("data-name-fit", "compact");
    expect(getComputedStyle(nicknameFrame).fontSize).toBe("10px");
    expect(getComputedStyle(nicknameFrame).overflow).toBe("hidden");
    expect(getComputedStyle(nicknameFrame).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(nicknameFrame).whiteSpace).toBe("nowrap");
  });

  it("以登入會員 API 資料取代固定 LINE ID、方案與到期日", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T04:00:00.000Z"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    await act(async () => { await Promise.resolve(); });
    expect(memberApi.bootstrapMember).toHaveBeenCalledTimes(1);
    expect(memberApi.bootstrapMember.mock.invocationCallOrder[0]).toBeLessThan(
      memberApi.fetchMemberProfile.mock.invocationCallOrder[0],
    );
    expect(screen.getByText("LINE 暱稱：")).toBeInTheDocument();
    expect(screen.getByText("年費方案")).toBeInTheDocument();
    expect(screen.getByText("2026/09/22")).toBeInTheDocument();
    expect(screen.getByText("剩餘 10 天")).toBeInTheDocument();
    expect(screen.queryByText("LINE ID：lottery_matrix")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("沒有付費方案與到期日時顯示免費會員核心功能體驗", async () => {
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      lineUserId: "line-free",
      planName: null,
      planExpiresAt: null,
      isLifetime: false,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByText("免費會員")).toBeInTheDocument();
    expect(screen.getByText("核心功能體驗")).toBeInTheDocument();
    expect(screen.queryByText("享有所有 Matrix Pro 功能")).not.toBeInTheDocument();
    expect(screen.queryByText(/剩餘 .* 天/)).not.toBeInTheDocument();
  });

  it("終身方案不顯示 API 內的固定到期日", async () => {
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      lineUserId: "line-lifetime",
      planName: "終身方案",
      planExpiresAt: "2027-07-23T00:00:00.000Z",
      isLifetime: true,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("LINE 暱稱：")).toBeInTheDocument());
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

  it("登出前先確認，取消時不呼叫登出 API", async () => {
    appDialog.confirm.mockResolvedValueOnce(false);
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "登出" }));

    await waitFor(() => expect(appDialog.confirm).toHaveBeenCalledWith({
      title: "確認登出？",
      description: "登出後需重新登入才能繼續使用帳號功能。",
      confirmLabel: "確認登出",
      cancelLabel: "取消",
      tone: "warning",
      icon: "logout",
    }));
    expect(lineAuth.signOutFromMatrix).not.toHaveBeenCalled();
  });

  it("確認對話框開啟期間維持同一登出按鈕的 busy 狀態並防止重入", async () => {
    let resolveConfirmation!: (confirmed: boolean) => void;
    appDialog.confirm.mockReturnValueOnce(new Promise((resolve) => {
      resolveConfirmation = resolve;
    }));
    render(<ProfilePage onNavigate={vi.fn()} />);
    const logout = await screen.findByRole("button", { name: "登出" });

    fireEvent.click(logout);

    const signingOut = await screen.findByRole("button", { name: "登出中…" });
    expect(signingOut).toBe(logout);
    expect(signingOut).toBeDisabled();
    fireEvent.click(signingOut);
    expect(appDialog.confirm).toHaveBeenCalledTimes(1);

    await act(async () => { resolveConfirmation(false); });
    expect(screen.getByRole("button", { name: "登出" })).toBeEnabled();
    expect(lineAuth.signOutFromMatrix).not.toHaveBeenCalled();
  });

  it("登出成功後使用共用成功提示", async () => {
    render(<ProfilePage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "登出" }));

    await waitFor(() => expect(lineAuth.signOutFromMatrix).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({ title: "已登出", tone: "success" }));
  });

  it("確認登出後在同一按鈕顯示登出中狀態", async () => {
    lineAuth.signOutFromMatrix.mockReturnValueOnce(new Promise(() => undefined));
    render(<ProfilePage onNavigate={vi.fn()} />);
    const logout = await screen.findByRole("button", { name: "登出" });

    fireEvent.click(logout);

    const signingOut = await screen.findByRole("button", { name: "登出中…" });
    expect(signingOut).toBe(logout);
    expect(signingOut).toBeDisabled();
    expect(signingOut).toHaveAttribute("aria-busy", "true");
  });

  it("無法確認登出結果時不顯示已登出", async () => {
    lineAuth.signOutFromMatrix.mockRejectedValueOnce(new Error("SUPABASE_SIGN_OUT_UNCERTAIN"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "登出" }));

    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({
      title: "登出失敗",
      description: "請稍後再試。",
      tone: "danger",
    }));
    expect(appDialog.alert).not.toHaveBeenCalledWith({ title: "已登出", tone: "success" });
  });

  it("登出失敗時使用共用危險提示並允許重試", async () => {
    let rejectLogout!: (reason: Error) => void;
    lineAuth.signOutFromMatrix.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectLogout = reject;
    }));
    render(<ProfilePage onNavigate={vi.fn()} />);
    const logout = await screen.findByRole("button", { name: "登出" });

    fireEvent.click(logout);

    await waitFor(() => expect(lineAuth.signOutFromMatrix).toHaveBeenCalledTimes(1));

    await act(async () => {
      rejectLogout(new Error("private logout detail"));
    });

    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({
      title: "登出失敗",
      description: "請稍後再試。",
      tone: "danger",
    }));
    expect(document.querySelector(".profile-logout-error")).toBeNull();
    expect(logout).toBeEnabled();
    expect(logout).toHaveAttribute("aria-busy", "false");

    fireEvent.click(logout);
    await waitFor(() => expect(lineAuth.signOutFromMatrix).toHaveBeenCalledTimes(2));
  });
});
