// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/render-with-member-session";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const reviewSetting = vi.hoisted(() => ({ visible: false }));
vi.mock("../permission-settings", () => ({ usePermissionSettings: () => ({ ecpayReviewLoginVisible: reviewSetting.visible }) }));

const purchaseSetting = vi.hoisted(() => ({ visible: false }));
vi.mock("../subscription-purchase-visibility", () => ({ useSubscriptionPurchaseVisible: () => purchaseSetting.visible }));

const memberApi = vi.hoisted(() => ({ bootstrapMember: vi.fn(), fetchMemberProfile: vi.fn(), fetchMemberPaymentHistory: vi.fn() }));
const checkout = vi.hoisted(() => ({ beginEcpayCheckout: vi.fn() }));
const lineAuth = vi.hoisted(() => ({
  prepareLineLoginUrl: vi.fn(),
  shouldUseDirectLineBrowserLink: vi.fn(),
  signInWithLine: vi.fn(),
  signOutFromMatrix: vi.fn(),
  reconcilePendingLineLogoutPresence: vi.fn(),
  isExplicitLogoutPushCleanupInProgress: vi.fn(),
}));
const googleAuth = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));
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
  const client = { auth };
  return {
    auth,
    emitAuthState: (event: string, session: unknown) => authStateListener?.(event, session),
    getClient: vi.fn(() => client),
    resetAuthStateListener: () => { authStateListener = null; },
    unsubscribe,
  };
});

vi.mock("../member-api", () => ({
  bootstrapMember: memberApi.bootstrapMember,
  fetchMemberProfile: memberApi.fetchMemberProfile,
  fetchMemberPaymentHistory: memberApi.fetchMemberPaymentHistory,
}));
vi.mock("../ecpay-checkout", () => ({ beginEcpayCheckout: checkout.beginEcpayCheckout }));
vi.mock("../auth/line-auth", () => ({
  prepareLineLoginUrl: lineAuth.prepareLineLoginUrl,
  shouldUseDirectLineBrowserLink: lineAuth.shouldUseDirectLineBrowserLink,
  signInWithLine: lineAuth.signInWithLine,
  signOutFromMatrix: lineAuth.signOutFromMatrix,
  reconcilePendingLineLogoutPresence: lineAuth.reconcilePendingLineLogoutPresence,
  isExplicitLogoutPushCleanupInProgress: lineAuth.isExplicitLogoutPushCleanupInProgress,
}));
vi.mock("../auth/google-auth", () => ({ signInWithGoogle: googleAuth.signInWithGoogle }));
vi.mock("../lib/supabase", () => ({ getSupabaseClient: supabase.getClient }));
vi.mock("../dialog/AppDialog", () => ({ useAppDialog: () => appDialog }));
vi.mock("../pwa-lifecycle", () => ({ usePwaLifecycle: pwaLifecycle.usePwaLifecycle }));

import { FeaturePageRouter, ProfilePage } from "../FeaturePages";
import { ProPlansPage, SubscriptionManagementPage } from "../features/MemberPages";

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
  purchaseSetting.visible = false;
  reviewSetting.visible = false;
  memberApi.fetchMemberPaymentHistory.mockReset().mockResolvedValue([]);
  checkout.beginEcpayCheckout.mockReset().mockResolvedValue("manual");
  window.sessionStorage.clear();
  lineAuth.prepareLineLoginUrl.mockReset().mockResolvedValue("https://project.supabase.co/auth/v1/authorize?provider=custom%3Aline");
  lineAuth.shouldUseDirectLineBrowserLink.mockReset().mockReturnValue(false);
  lineAuth.signInWithLine.mockReset().mockResolvedValue(undefined);
  lineAuth.signOutFromMatrix.mockReset().mockResolvedValue(undefined);
  lineAuth.reconcilePendingLineLogoutPresence.mockReset();
  lineAuth.isExplicitLogoutPushCleanupInProgress.mockReset().mockReturnValue(false);
  googleAuth.signInWithGoogle.mockReset().mockResolvedValue(undefined);
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
    data: { session: { access_token: "member-session", user: { id: "member-user", user_metadata: { name: "LINE 會員" } } } },
    error: null,
  });
  memberApi.fetchMemberProfile.mockReset().mockResolvedValue({
    memberId: "11111111-1111-4111-8111-111111111111",
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
  it("購買關閉時保留訂閱狀態與登入、付款紀錄及退款規範，只隱藏購買入口", async () => {
    const onNavigate = vi.fn();
    render(<ProfilePage onNavigate={onNavigate} />);

    const logout = await screen.findByRole("button", { name: "登出" });
    expect(parseFloat(getComputedStyle(logout).minHeight)).toBeGreaterThanOrEqual(44);
    expect(screen.queryByRole("button", { name: "訂閱方案／收費標準" })).not.toBeInTheDocument();
    expect(screen.getByText("目前訂閱狀態")).toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toBeInTheDocument();
    expect(await screen.findByText("年費方案")).toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toHaveAttribute("data-plan-tier", "yearly");
    const artwork = document.querySelector(".membership-reference-art")!;
    expect(artwork).toHaveAttribute("data-subscription-visible", "true");
    expect(artwork.querySelector(".subscription-entry-art-mask")).toBeInTheDocument();
    const [, artworkTop, , artworkHeight] = artwork.querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number);
    // The existing frame remains visible; the old crown is no longer repainted.
    expect(artworkTop).toBeLessThan(387);
    expect(artworkTop + artworkHeight).toBeGreaterThanOrEqual(740);
    expect(artwork.querySelector(".subscription-information-art")).not.toBeInTheDocument();
    expect(document.querySelector(".subscription-status-emblem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "付款紀錄" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退款規範" })).toBeInTheDocument();
    expect(screen.getByText("會員相關")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "隱私權政策" })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("永久會員在我的頁面顯示無到期日", async () => {
    memberApi.fetchMemberProfile.mockResolvedValue({
      memberId: "member-lifetime",
      lineUserId: "line-lifetime",
      planName: "終身方案",
      planExpiresAt: null,
      isLifetime: true,
    });
    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByText("終身方案")).toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toHaveAttribute("data-plan-tier", "lifetime");
    const expiry = document.querySelector(".subscription-expiry");
    expect(expiry).toHaveTextContent("無到期日");
    expect(expiry).not.toHaveTextContent("剩餘");
  });

  it("管理訂閱保留目前方案並隱藏購買入口", async () => {
    render(<SubscriptionManagementPage onNavigate={vi.fn()} />);
    expect(await screen.findByText("年費方案")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "訂閱方案／收費標準" })).not.toBeInTheDocument();
  });

  it.each(["pro-plans", "manual-transfer"] as const)("暫時隱藏 %s 購買頁並顯示會員頁", async (purchaseScreen) => {
    render(<FeaturePageRouter screen={purchaseScreen} onNavigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "我的", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確定付款" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交" })).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "登出" });
    expect(memberApi.fetchMemberPaymentHistory).not.toHaveBeenCalled();
  });

  it('購買關閉仍可進入已付款紀錄與退款規範', async () => {
    const first = render(<FeaturePageRouter screen="payment-history" onNavigate={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: '付款紀錄', level: 1 })).toBeInTheDocument();
    first.unmount();
    render(<FeaturePageRouter screen="refund-policy" onNavigate={vi.fn()} />);
    expect(screen.getAllByRole('heading', { name: '退款規範', level: 1 })).toHaveLength(2);
  });

  it("LINE 暱稱為資訊文字，不呈現輸入框邊線", async () => {
    render(<ProfilePage onNavigate={vi.fn()} />);
    await screen.findByRole("button", { name: "登出" });
    const nickname = await screen.findByText("LINE 會員");
    expect(screen.queryByText(/LINE ID：/)).not.toBeInTheDocument();
    expect(getComputedStyle(nickname).borderTopWidth).toBe("0px");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it('PWA 回傳確認前維持登入中，完成後只提示一次並回首頁', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    let complete!: (value: string) => void;
    lineAuth.signInWithLine.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const onNavigate = vi.fn();
    render(<ProfilePage onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'LINE 登入' }));
    act(() => supabase.emitAuthState('SIGNED_IN', { access_token: 'early-broadcast' }));
    expect(screen.getByRole('button', { name: '登入中…' })).toBeDisabled();
    expect(appDialog.alert).not.toHaveBeenCalled();
    await act(async () => { complete('pwa'); });
    expect(appDialog.alert).toHaveBeenCalledExactlyOnceWith({ title: '登入成功', tone: 'success' });
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('home');
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).toBeNull();
  });

  it('PWA 視窗失聯後重新讀到 session 時保留登入並回首頁', async () => {
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'member-session', user: { id: 'member-real' } } },
        error: null,
      });
    lineAuth.signInWithLine.mockRejectedValue(new Error('LINE_LOGIN_INCOMPLETE'));
    const onNavigate = vi.fn();
    render(<ProfilePage onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'LINE 登入' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('home'));
    expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument();
    expect(appDialog.alert).toHaveBeenCalledExactlyOnceWith({ title: '登入成功', tone: 'success' });
  });

  it('PWA 視窗失聯且 session 無法確認時提供重新檢查', async () => {
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockRejectedValueOnce(new Error('unavailable'));
    lineAuth.signInWithLine.mockRejectedValue(new Error('LINE_LOGIN_INCOMPLETE'));
    render(<ProfilePage onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'LINE 登入' }));
    expect(await screen.findByRole('button', { name: '重新檢查' })).toBeInTheDocument();
    expect(appDialog.alert).not.toHaveBeenCalledWith({ title: '登入成功', tone: 'success' });
  });

  it("moves the combined support entry below legal information and removes its duplicate entries", () => {
    purchaseSetting.visible = true;
    render(<ProfilePage onNavigate={vi.fn()} />);

    const menuTitles = Array.from(document.querySelectorAll<HTMLElement>(".profile-menu > .section-title"))
      .map((title) => title.textContent?.trim());
    expect(menuTitles).toEqual(["會員相關", "推廣相關", "法律資訊", "系統相關", "客服與支援"]);
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

    expect(screen.getByRole("heading", { name: "我的", level: 1 })).toBeVisible();
    expect(screen.getByText("MY ACCOUNT")).toBeVisible();
  });

  it("綠界開關控制入口，按鈕位於 LINE 前且關閉不影響其他登入", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const view = render(<ProfilePage onNavigate={vi.fn()} />);
    await screen.findByRole("button", { name: "LINE 登入" });
    expect(screen.queryByRole("button", { name: "綠界審核登入" })).not.toBeInTheDocument();
    reviewSetting.visible = true;
    view.rerender(<ProfilePage onNavigate={vi.fn()} />);
    const providers = Array.from(document.querySelectorAll('[data-login-provider]')).map(node => node.getAttribute('data-login-provider'));
    expect(providers).toEqual(['ecpay', 'line', 'google']);
    fireEvent.click(screen.getByRole('button', { name: '綠界審核登入' }));
    expect(screen.getByRole('dialog', { name: '綠界審核登入' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    reviewSetting.visible = false;
    view.rerender(<ProfilePage onNavigate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '綠界審核登入' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'LINE 登入' })).toBeEnabled();
  });

  it("未登入時 LINE 與 Google 登入按鈕垂直排列", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<ProfilePage onNavigate={vi.fn()} />);

    const googleLogin = await screen.findByRole("button", { name: "Google 登入" });
    const lineLogin = screen.getByRole("button", { name: "LINE 登入" });
    const card = document.querySelector<HTMLElement>('.profile-card[data-auth-layout="multiple"]');
    const actions = card?.querySelector<HTMLElement>(".profile-auth-actions");
    expect(card).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(Array.from(actions!.querySelectorAll<HTMLElement>("[data-login-provider]")).map((button) => button.dataset.loginProvider)).toEqual(["line", "google"]);
    const cardStyle = getComputedStyle(card!);
    expect(cardStyle.getPropertyValue("--profile-auth-column-count").trim()).toBe("1");
    expect(cardStyle.getPropertyValue("--profile-auth-zone-width").trim()).toBe("15.48cqw");
    expect(parseFloat(getComputedStyle(lineLogin).minHeight)).toBe(32);
    expect(parseFloat(getComputedStyle(googleLogin).minHeight)).toBe(32);
    expect(getComputedStyle(lineLogin).borderTopStyle).toBe("solid");
    expect(getComputedStyle(googleLogin).borderTopStyle).toBe("solid");
    const authPillMask = document.querySelector<SVGRectElement>(".membership-reference-art .profile-auth-pill-mask");
    expect(authPillMask).not.toBeNull();
    expect(authPillMask?.getAttribute("x")).toBe("1235");
    expect(authPillMask?.getAttribute("y")).toBe("145");
    expect(authPillMask?.getAttribute("width")).toBe("285");
    expect(authPillMask?.getAttribute("height")).toBe("110");
  });

  it("Google 登入啟動後維持登入中，交由 Supabase OAuth 接手導向", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    render(<ProfilePage onNavigate={vi.fn()} />);

    const googleLogin = await screen.findByRole("button", { name: "Google 登入" });
    expect(screen.getByRole("button", { name: "LINE 登入" })).toBeInTheDocument();
    fireEvent.click(googleLogin);

    await waitFor(() => expect(googleAuth.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Google 登入中…" })).toBeDisabled();
    expect(appDialog.alert).not.toHaveBeenCalledWith(expect.objectContaining({ title: "登入失敗" }));
  });

  it("Google OAuth 啟動失敗時恢復登入按鈕並使用共用危險提示", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    googleAuth.signInWithGoogle.mockRejectedValueOnce(new Error("GOOGLE_OAUTH_FAILED"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Google 登入" }));

    await waitFor(() => expect(appDialog.alert).toHaveBeenCalledWith({
      title: "登入失敗",
      description: "Google 登入目前無法使用，請稍後再試。",
      tone: "danger",
    }));
    expect(screen.getByRole("button", { name: "Google 登入" })).toBeEnabled();
  });

  it("手機瀏覽器使用直接 LINE 登入連結，不由 JavaScript 啟動 OAuth 導向", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    lineAuth.shouldUseDirectLineBrowserLink.mockReturnValue(true);
    const url = "https://project.supabase.co/auth/v1/authorize?provider=custom%3Aline";
    lineAuth.prepareLineLoginUrl.mockResolvedValue(url);

    render(<ProfilePage onNavigate={vi.fn()} />);

    const login = await screen.findByRole("button", { name: "LINE 登入" });
    await waitFor(() => expect(login).toHaveAttribute("href", url));
    expect(login.tagName).toBe("A");
    expect(lineAuth.prepareLineLoginUrl).toHaveBeenCalledTimes(1);

    login.addEventListener("click", (event) => event.preventDefault(), { once: true, capture: true });
    fireEvent.click(login);

    expect(lineAuth.signInWithLine).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("matrix-line-login-pending")).not.toBeNull();
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
    expect(screen.getByRole("img", { name: "會員頭貼" })).toBeInTheDocument();

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

  it("會員登入有頭貼時顯示會員頭貼", async () => {
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

    expect(await screen.findByRole("img", { name: "會員頭貼" })).toHaveAttribute(
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
    const lineId = "line-user-id-that-is-long-123456";
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "member-session",
          user: {
            user_metadata: { name: nickname },
            identities: [{ provider: "custom:line", provider_id: lineId }],
          },
        },
      },
      error: null,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    const nicknameFrame = await screen.findByText(nickname);
    expect(screen.queryByText(new RegExp(lineId))).not.toBeInTheDocument();
    expect(screen.queryByText(/會員ID：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/會員名稱：/)).not.toBeInTheDocument();
    expect(nicknameFrame).toHaveAttribute("data-name-fit", "compact");
    expect(getComputedStyle(nicknameFrame).fontSize).toBe("2.8cqw");
    expect(getComputedStyle(nicknameFrame).overflow).toBe("hidden");
    expect(getComputedStyle(nicknameFrame).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(nicknameFrame).whiteSpace).toBe("nowrap");
  });

  it("以登入工作階段顯示暱稱，並以會員 API 資料顯示方案與到期日", async () => {
    purchaseSetting.visible = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T04:00:00.000Z"));
    render(<ProfilePage onNavigate={vi.fn()} />);

    await act(async () => { await Promise.resolve(); });
    expect(memberApi.bootstrapMember).toHaveBeenCalled();
    expect(memberApi.bootstrapMember.mock.invocationCallOrder[0]).toBeLessThan(
      memberApi.fetchMemberProfile.mock.invocationCallOrder[0],
    );
    expect(screen.getByText("LINE 會員")).toBeInTheDocument();
    expect(screen.queryByText(/line-real/)).not.toBeInTheDocument();
    expect(screen.getByText("年費方案")).toBeInTheDocument();
    expect(screen.getByText("2026/09/22")).toBeInTheDocument();
    expect(screen.getByText("剩餘 10 天")).toBeInTheDocument();
    expect(screen.queryByText("LINE ID：lottery_matrix")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("沒有付費方案與到期日時顯示免費會員核心功能體驗", async () => {
    purchaseSetting.visible = true;
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      memberId: "member-free",
      lineUserId: "line-free",
      planName: null,
      planExpiresAt: null,
      isLifetime: false,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByText("免費會員")).toBeInTheDocument();
    expect(document.querySelector(".subscription-entry-art-mask")).not.toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toHaveAttribute("data-plan-tier", "free");
    expect(screen.getByText("核心功能體驗")).toBeInTheDocument();
    expect(screen.queryByText("享有所有 Matrix Pro 功能")).not.toBeInTheDocument();
    expect(screen.queryByText(/剩餘 .* 天/)).not.toBeInTheDocument();
  });

  it("終身方案不顯示 API 內的固定到期日", async () => {
    purchaseSetting.visible = true;
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      memberId: "member-lifetime",
      lineUserId: "line-lifetime",
      planName: "終身方案",
      planExpiresAt: "2027-07-23T00:00:00.000Z",
      isLifetime: true,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByText("終身方案")).toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toHaveAttribute("data-plan-tier", "lifetime");
    expect(screen.queryByText("2027/07/23")).not.toBeInTheDocument();
    expect(screen.queryByText(/剩餘 .* 天/)).not.toBeInTheDocument();
  });

  it("以 Asia/Taipei 日曆日計算跨 UTC 日期邊界的到期日", async () => {
    purchaseSetting.visible = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T04:00:00.000Z"));
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      memberId: "member-taipei",
      lineUserId: "line-taipei",
      planName: "月費方案",
      planExpiresAt: "2026-09-12T16:00:00.000Z",
      isLifetime: false,
    });

    render(<ProfilePage onNavigate={vi.fn()} />);

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("2026/09/13")).toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toHaveAttribute("data-plan-tier", "monthly");
    expect(screen.getByText("剩餘 1 天")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it.each([
    ["季費方案", "quarterly"],
    ["終身方案", "lifetime"],
    ["終生方案", "lifetime"],
  ])("%s 保留原方案文字並映射到 %s 視覺", async (planName, tier) => {
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      memberId: "member-plan",
      lineUserId: "line-plan",
      planName,
      planExpiresAt: null,
      isLifetime: false,
    });
    render(<ProfilePage onNavigate={vi.fn()} />);

    expect(await screen.findByText(planName, { selector: ".subscription-plan strong" })).toBeInTheDocument();
    expect(document.querySelector(".subscription-status-card")).toHaveAttribute("data-plan-tier", tier);
    expect(document.querySelector(".subscription-status-stage > .subscription-status-emblem[aria-hidden='true']")).not.toBeNull();
    expect(document.querySelector(".subscription-status-stage > .subscription-status-content > .subscription-plan + .subscription-expiry")).not.toBeNull();
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


it("開啟購買開關後恢復入口，關閉後不需重掛即可隱藏入口並保留訂閱狀態", async () => {
  const onNavigate = vi.fn();
  const view = render(<ProfilePage onNavigate={onNavigate} />);
  await screen.findByRole("button", { name: "登出" });
  purchaseSetting.visible = true;
  view.rerender(<ProfilePage onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "訂閱方案／收費標準" }));
  expect(onNavigate).toHaveBeenCalledWith("pro-plans");
  expect(screen.getByText("目前訂閱狀態")).toBeInTheDocument();
  const [, artworkTop, , artworkHeight] = document.querySelector(".membership-reference-art > svg")!.getAttribute("viewBox")!.split(" ").map(Number);
  expect(artworkTop).toBeLessThan(387);
  expect(artworkTop + artworkHeight).toBeGreaterThanOrEqual(740);
  expect(document.querySelector(".subscription-information-art")).toBeNull();
  expect(document.querySelector(".subscription-status-emblem")).not.toBeNull();
  expect(screen.getByRole("button", { name: "付款紀錄" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "退款規範" })).toBeInTheDocument();
  purchaseSetting.visible = false;
  view.rerender(<ProfilePage onNavigate={onNavigate} />);
  expect(screen.queryByRole("button", { name: "訂閱方案／收費標準" })).not.toBeInTheDocument();
  expect(screen.getByText("目前訂閱狀態")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "付款紀錄" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "退款規範" })).toBeInTheDocument();
});

it("購買開關關閉時會卸載已開啟的方案頁", async () => {
  purchaseSetting.visible = true;
  const onNavigate = vi.fn();
  const view = render(<FeaturePageRouter screen="pro-plans" onNavigate={onNavigate} />);
  expect(document.querySelector(".pro-plans-screen")).not.toBeNull();
  purchaseSetting.visible = false;
  view.rerender(<FeaturePageRouter screen="pro-plans" onNavigate={onNavigate} />);
  expect(document.querySelector(".pro-plans-screen")).toBeNull();
  expect(await screen.findByRole("button", { name: "登出" })).toBeInTheDocument();
});

it("永久會員在方案頁看見原因但無法送出任何付費方案", async () => {
  memberApi.fetchMemberProfile.mockResolvedValueOnce({
    memberId: "member-lifetime", lineUserId: "line-lifetime", planName: "終身方案",
    planExpiresAt: null, isLifetime: true,
  });
  render(<ProPlansPage onNavigate={vi.fn()} />);
  const pay = await screen.findByRole("button", { name: "確定付款" });
  await waitFor(() => expect(screen.getByText(/永久會員無需再購買/)).toBeInTheDocument());
  expect(pay).toBeDisabled();
  fireEvent.click(pay);
  expect(appDialog.confirm).not.toHaveBeenCalled();
  expect(checkout.beginEcpayCheckout).not.toHaveBeenCalled();
});

it("有效年費會員只能續購同級，月／季方案不會進入付款", async () => {
  memberApi.fetchMemberProfile.mockResolvedValueOnce({
    memberId: "member-year", lineUserId: "line-year", planName: "年費方案",
    planExpiresAt: "2099-01-01T00:00:00.000Z", isLifetime: false,
  });
  const onNavigate = vi.fn();
  render(<ProPlansPage onNavigate={onNavigate} />);
  const pay = await screen.findByRole("button", { name: "確定付款" });
  await waitFor(() => expect(screen.getByText(/有效的年費方案無法購買較低方案/)).toBeInTheDocument());
  expect(pay).toBeDisabled();
  expect(screen.getByText("不適用", { selector: ".renewal-card dd" })).toBeInTheDocument();

  const carousel = document.querySelector<HTMLElement>(".plan-carousel")!;
  Object.defineProperty(carousel, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(carousel, "scrollLeft", { configurable: true, writable: true, value: 200 });
  carousel.querySelectorAll<HTMLElement>(".plan-card").forEach((card, index) => {
    Object.defineProperty(card, "offsetLeft", { configurable: true, value: index * 100 });
    Object.defineProperty(card, "clientWidth", { configurable: true, value: 100 });
  });
  fireEvent.scroll(carousel);
  expect(screen.getByText("季費方案", { selector: ".renewal-card dd" })).toBeInTheDocument();
  expect(pay).toBeDisabled();
  carousel.scrollLeft = 300;
  fireEvent.scroll(carousel);
  expect(screen.getByText("年費方案", { selector: ".renewal-card dd" })).toBeInTheDocument();
  expect(pay).toBeEnabled();
  fireEvent.click(pay);
  await waitFor(() => expect(checkout.beginEcpayCheckout).toHaveBeenCalledWith("year", { isCurrent: expect.any(Function) }));
  expect(onNavigate).toHaveBeenCalledWith("manual-transfer");
});

it("方案資料未讀取成功前不允許送出付款", async () => {
  memberApi.fetchMemberProfile.mockRejectedValueOnce(new Error("offline"));
  render(<ProPlansPage onNavigate={vi.fn()} />);
  const pay = screen.getByRole("button", { name: "確定付款" });
  expect(pay).toBeDisabled();
  await waitFor(() => expect(screen.getByText(/會員資料載入失敗/)).toBeInTheDocument());
  expect(checkout.beginEcpayCheckout).not.toHaveBeenCalled();
});

it("付款確認尚未結束時連點只會開啟一次確認，也不會建立重複訂單", async () => {
  let cancel!: (value: boolean) => void;
  appDialog.confirm.mockReturnValueOnce(new Promise<boolean>((resolve) => { cancel = resolve; }));
  render(<ProPlansPage onNavigate={vi.fn()} />);
  const pay = screen.getByRole("button", { name: "確定付款" });
  await waitFor(() => expect(pay).toBeEnabled());
  fireEvent.click(pay);
  fireEvent.click(pay);
  expect(appDialog.confirm).toHaveBeenCalledTimes(1);
  await act(async () => cancel(false));
  expect(checkout.beginEcpayCheckout).not.toHaveBeenCalled();
});
