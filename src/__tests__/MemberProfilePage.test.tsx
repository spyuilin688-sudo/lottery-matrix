// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const memberApi = vi.hoisted(() => ({ bootstrapMember: vi.fn(), fetchMemberProfile: vi.fn() }));
const lineAuth = vi.hoisted(() => ({ signInWithLine: vi.fn(), signOutFromMatrix: vi.fn() }));
const appDialog = vi.hoisted(() => ({ confirm: vi.fn(), alert: vi.fn() }));
const pwaLifecycle = vi.hoisted(() => ({ usePwaLifecycle: vi.fn() }));
const supabase = vi.hoisted(() => {
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
  };
  return { auth, getClient: vi.fn(() => ({ auth })), unsubscribe };
});

vi.mock("../member-api", () => ({
  bootstrapMember: memberApi.bootstrapMember,
  fetchMemberProfile: memberApi.fetchMemberProfile,
}));
vi.mock("../auth/line-auth", () => ({
  signInWithLine: lineAuth.signInWithLine,
  signOutFromMatrix: lineAuth.signOutFromMatrix,
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
  cleanup();
});

beforeEach(() => {
  window.sessionStorage.clear();
  lineAuth.signInWithLine.mockReset().mockResolvedValue(undefined);
  lineAuth.signOutFromMatrix.mockReset().mockResolvedValue(undefined);
  appDialog.confirm.mockReset().mockResolvedValue(true);
  appDialog.alert.mockReset().mockResolvedValue(undefined);
  pwaLifecycle.usePwaLifecycle.mockReset().mockReturnValue({
    isInstalled: false,
    showInstallAction: false,
    requestInstall: vi.fn().mockResolvedValue("unavailable"),
  });
  supabase.unsubscribe.mockReset();
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

    expect(login).toBeDisabled();
    expect(login).toHaveAttribute("aria-busy", "true");
    expect(lineAuth.signInWithLine).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(login).toBeEnabled());
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

  it("登出成功後使用共用成功提示", async () => {
    render(<ProfilePage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "登出" }));

    await waitFor(() => expect(lineAuth.signOutFromMatrix).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({ title: "已登出", tone: "success" }));
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
