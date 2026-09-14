// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberNotificationSettings } from "../member-api";

const memberApi = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
  hasAuthenticatedMemberSession: vi.fn(),
}));

const pushSubscription = vi.hoisted(() => ({
  disablePushNotifications: vi.fn(),
  enablePushNotifications: vi.fn(),
  getPushStatus: vi.fn(),
}));

const reactStateTracker = vi.hoisted(() => ({ capture: false, updates: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: ((initialState: unknown) => {
      const [value, setValue] = actual.useState(initialState);
      return [value, (next: unknown) => {
        if (reactStateTracker.capture) reactStateTracker.updates += 1;
        setValue(next as never);
      }];
    }) as typeof actual.useState,
  };
});

vi.mock("../member-api", () => ({
  fetchNotificationSettings: memberApi.fetchNotificationSettings,
  saveNotificationSettings: memberApi.saveNotificationSettings,
  hasAuthenticatedMemberSession: memberApi.hasAuthenticatedMemberSession,
}));

vi.mock("../push-subscription", async (importOriginal) => ({
  ...await importOriginal<typeof import("../push-subscription")>(),
  ...pushSubscription,
}));

import { NotificationsPagePatched } from "../NotificationsPagePatched";
import { PushSubscriptionError } from "../push-subscription";

afterEach(cleanup);

const storedSettings: MemberNotificationSettings = {
  settings: { bet: true, result: true, status: true, card: true, collision: false, system: true, expiry: true },
  selectedOptions: {
    result: ["今彩539", "天天樂", "六合彩", "大樂透"],
    status: ["今彩539", "天天樂", "六合彩", "大樂透"],
    card: ["今彩539", "天天樂", "六合彩", "大樂透"],
    system: ["維護", "更新"],
    expiry: ["提前1日", "提前3日", "提前7日"],
  },
  betTimes: {
    今彩539: ["", ""],
    天天樂: ["", ""],
    六合彩: ["", ""],
    大樂透: ["", ""],
  },
  statusOptions: {
    今彩539: ["啟動", "聚合", "共振", "臨界"],
    天天樂: ["啟動", "聚合", "共振", "臨界"],
    六合彩: ["啟動", "聚合", "共振", "臨界"],
    大樂透: ["啟動", "聚合", "共振", "臨界"],
  },
  collisionOptions: {
    今彩539: ["獨碰二星", "獨碰三星"],
    天天樂: ["獨碰二星", "獨碰三星"],
    六合彩: ["獨碰二星", "獨碰三星"],
    大樂透: ["獨碰二星", "獨碰三星"],
  },
};

beforeEach(() => {
  reactStateTracker.capture = false;
  reactStateTracker.updates = 0;
  memberApi.fetchNotificationSettings.mockReset().mockResolvedValue(structuredClone(storedSettings));
  memberApi.saveNotificationSettings.mockReset().mockImplementation(async (settings) => settings);
  memberApi.hasAuthenticatedMemberSession.mockReset().mockResolvedValue(true);
  pushSubscription.getPushStatus.mockReset().mockResolvedValue({ supported: true, permission: "default", enabled: false });
  pushSubscription.enablePushNotifications.mockReset().mockResolvedValue({ supported: true, permission: "granted", enabled: true });
  pushSubscription.disablePushNotifications.mockReset().mockResolvedValue({ supported: true, permission: "granted", enabled: false });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function pushFailure(stage: "service-worker-registration" | "browser-subscription" | "supabase-save") {
  return Object.assign(
    new PushSubscriptionError({ supported: true, permission: "granted", enabled: false }),
    { stage },
  );
}

describe("NotificationsPagePatched", () => {
  it("removes the retired winning notification and uses the settings title", async () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    expect(screen.queryByText("中獎通知")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "通知設定" })).toBeVisible();
  });

  it("全部關閉只停用目前可用的通知項目並保留手機推播與 Matrix 摘星", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(await screen.findByText("手機通知已開啟")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "全部關閉" }));

    for (const key of ["bet", "result", "status", "card", "expiry"]) {
      const row = document.querySelector<HTMLElement>(`[data-notification-key="${key}"]`)!;
      expect(within(row).getByRole("button", { name: `開啟${row.querySelector("h2 span")?.textContent}` })).toHaveAttribute("data-checked", "false");
    }
    expect(document.querySelector<HTMLButtonElement>('[data-notification-key="collision"] .toggle')).toHaveAttribute("data-checked", "false");
    expect(within(document.querySelector<HTMLElement>('[data-notification-key="system"]')!).getByRole("button", { name: "關閉手機通知" })).toHaveAttribute("data-checked", "true");
    expect(pushSubscription.disablePushNotifications).not.toHaveBeenCalled();
  });

  it("全部開啟只啟用目前可用的通知項目並保留手機推播與 Matrix 摘星", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      settings: {
        bet: false,
        result: false,
        status: false,
        card: false,
        collision: false,
        system: true,
        expiry: false,
      },
    });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]')!;
    await waitFor(() => expect(within(betRow).getByRole("button", { name: "開啟選號提醒" })).toHaveAttribute("data-checked", "false"));
    fireEvent.click(screen.getByRole("button", { name: "全部開啟" }));

    for (const key of ["bet", "result", "status", "card", "expiry"]) {
      const row = document.querySelector<HTMLElement>(`[data-notification-key="${key}"]`)!;
      expect(within(row).getByRole("button", { name: `關閉${row.querySelector("h2 span")?.textContent}` })).toHaveAttribute("data-checked", "true");
    }
    expect(document.querySelector<HTMLButtonElement>('[data-notification-key="collision"] .toggle')).toHaveAttribute("data-checked", "false");
    expect(within(document.querySelector<HTMLElement>('[data-notification-key="system"]')!).getByRole("button", { name: "開啟手機通知" })).toHaveAttribute("data-checked", "false");
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
  });

  it("未登入時不允許要求權限或建立手機訂閱", async () => {
    memberApi.hasAuthenticatedMemberSession.mockResolvedValue(false);
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    expect(await screen.findByText("請先使用 LINE 登入")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "請先使用 LINE 登入" })).toBeDisabled();
    expect(pushSubscription.getPushStatus).not.toHaveBeenCalled();
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
  });
  it("只在點擊既有系統通知開關後才開啟手機通知", async () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    await waitFor(() => expect(pushSubscription.getPushStatus).toHaveBeenCalledTimes(1));
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    await waitFor(() => expect(pushSubscription.enablePushNotifications).toHaveBeenCalledTimes(1));
  });

  it("成功保存手機訂閱後才顯示已開啟", async () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("手機通知已開啟")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "關閉手機通知" })).toHaveAttribute("data-checked", "true");
  });

  it("拒絕權限時維持未開啟並說明拒絕", async () => {
    pushSubscription.enablePushNotifications.mockResolvedValue({ supported: true, permission: "denied", enabled: false });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("手機通知未開啟")).toBeVisible();
    expect(screen.getByText("通知權限已拒絕")).toBeVisible();
  });

  it("不支援的手機維持未開啟並顯示固定說明", async () => {
    pushSubscription.enablePushNotifications.mockResolvedValue({ supported: false, permission: "default", enabled: false });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("此手機不支援通知")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "此手機不支援通知" })).toHaveAttribute("data-checked", "false");
  });

  it("推播程式註冊失敗時顯示對應文字", async () => {
    pushSubscription.enablePushNotifications.mockRejectedValue(pushFailure("service-worker-registration"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("推播程式註冊失敗")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "開啟手機通知" })).toHaveAttribute("data-checked", "false");
  });

  it("手機瀏覽器建立訂閱失敗時顯示對應文字", async () => {
    pushSubscription.enablePushNotifications.mockRejectedValue(pushFailure("browser-subscription"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("手機瀏覽器建立訂閱失敗")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "開啟手機通知" })).toHaveAttribute("data-checked", "false");
  });

  it("Supabase 儲存失敗時顯示對應文字", async () => {
    pushSubscription.enablePushNotifications.mockRejectedValue(pushFailure("supabase-save"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("Supabase 儲存失敗")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "開啟手機通知" })).toHaveAttribute("data-checked", "false");
  });

  it("關閉手機通知時停用既有手機訂閱", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    expect(await within(systemRow).findByRole("button", { name: "關閉手機通知" })).toBeVisible();
    fireEvent.click(within(systemRow).getByRole("button", { name: "關閉手機通知" }));

    await waitFor(() => expect(pushSubscription.disablePushNotifications).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("手機通知未開啟")).toBeVisible();
  });

  it("手機通知處理期間維持開關尺寸並阻止重複點擊", async () => {
    const request = deferred<{ supported: boolean; permission: NotificationPermission; enabled: boolean }>();
    pushSubscription.enablePushNotifications.mockReturnValue(request.promise);
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;
    const toggle = await within(systemRow).findByRole("button", { name: "開啟手機通知" });

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(pushSubscription.enablePushNotifications).toHaveBeenCalledTimes(1);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("手機通知開啟中");
    await act(async () => { request.resolve({ supported: true, permission: "granted", enabled: true }); });
    expect(await screen.findByText("手機通知已開啟")).toBeVisible();
  });

  it("初始化狀態確認前顯示檢查中並停用手機開關", async () => {
    const initialStatus = deferred<{ supported: boolean; permission: NotificationPermission; enabled: boolean }>();
    pushSubscription.getPushStatus.mockReturnValue(initialStatus.promise);
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    expect(within(systemRow).getByRole("button", { name: "正在檢查手機通知" })).toBeDisabled();
    expect(screen.getByText("正在檢查手機通知")).toBeVisible();
    await act(async () => { initialStatus.resolve({ supported: true, permission: "default", enabled: false }); });
    expect(within(systemRow).getByRole("button", { name: "開啟手機通知" })).toBeEnabled();
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
  });

  it("暫時檢查失敗可手動重查，不自動重試或要求通知權限", async () => {
    pushSubscription.getPushStatus.mockRejectedValueOnce(pushFailure("service-worker-registration"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    expect(await screen.findByText("手機通知暫時無法確認，請重新檢查")).toBeVisible();
    expect(screen.queryByText("此手機不支援通知")).toBeNull();
    expect(pushSubscription.getPushStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "重新檢查手機通知" }));
    await waitFor(() => expect(screen.queryByText("手機通知暫時無法確認，請重新檢查")).toBeNull());
    expect(pushSubscription.getPushStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "開啟手機通知" })).toBeEnabled();
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
  });

  it("頁面載入發現手機不支援時停用開關並且不要求權限", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: false, permission: "default", enabled: false });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    expect(await screen.findByText("此手機不支援通知")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "此手機不支援通知" })).toBeDisabled();
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
  });

  it("頁面載入發現通知權限已拒絕時停用開關並且不要求權限", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "denied", enabled: false });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    expect(await screen.findByText("手機通知未開啟")).toBeVisible();
    expect(screen.getByText("通知權限已拒絕")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "通知權限已拒絕" })).toBeDisabled();
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
  });

  it("關閉時暫時無法取得 Worker 不會誤報已關閉", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    pushSubscription.disablePushNotifications.mockRejectedValue(pushFailure("service-worker-registration"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "關閉手機通知" }));
    expect(await screen.findByText("手機通知關閉失敗，請稍後再試")).toBeVisible();
    expect(screen.getByRole("button", { name: "關閉手機通知" })).toHaveAttribute("data-checked", "true");
  });

  it("開啟手機訂閱不會儲存既有通知設定", async () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));

    expect(await screen.findByText("手機通知已開啟")).toBeVisible();
    expect(memberApi.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("關閉手機訂閱不會儲存既有通知設定", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "關閉手機通知" }));

    expect(await screen.findByText("手機通知未開啟")).toBeVisible();
    expect(memberApi.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("儲存既有通知設定不會改變手機訂閱狀態", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;
    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]')!;

    await within(systemRow).findByRole("button", { name: "關閉手機通知" });
    fireEvent.click(within(betRow).getAllByRole("button")[1]);

    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(1));
    expect(within(systemRow).getByRole("button", { name: "關閉手機通知" })).toHaveAttribute("data-checked", "true");
    expect(pushSubscription.enablePushNotifications).not.toHaveBeenCalled();
    expect(pushSubscription.disablePushNotifications).not.toHaveBeenCalled();
  });

  it("關閉手機訂閱失敗時顯示對應的失敗文案", async () => {
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    pushSubscription.disablePushNotifications.mockRejectedValue(new PushSubscriptionError({ supported: true, permission: "granted", enabled: true }));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "關閉手機通知" }));

    expect(await screen.findByText("手機通知關閉失敗，請稍後再試")).toBeVisible();
    expect(within(systemRow).getByRole("button", { name: "關閉手機通知" })).toHaveAttribute("data-checked", "true");
  });

  it("離頁後忽略已完成的手機通知開啟操作", async () => {
    const request = deferred<{ supported: boolean; permission: NotificationPermission; enabled: boolean }>();
    pushSubscription.enablePushNotifications.mockReturnValue(request.promise);
    const { unmount } = render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "開啟手機通知" }));
    unmount();
    reactStateTracker.capture = true;
    await act(async () => { request.resolve({ supported: true, permission: "granted", enabled: true }); });

    expect(reactStateTracker.updates).toBe(0);
  });

  it("離頁後忽略已失敗的手機通知關閉操作", async () => {
    const request = deferred<{ supported: boolean; permission: NotificationPermission; enabled: boolean }>();
    pushSubscription.getPushStatus.mockResolvedValue({ supported: true, permission: "granted", enabled: true });
    pushSubscription.disablePushNotifications.mockReturnValue(request.promise);
    const { unmount } = render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const systemRow = document.querySelector<HTMLElement>('[data-notification-key="system"]')!;

    fireEvent.click(await within(systemRow).findByRole("button", { name: "關閉手機通知" }));
    unmount();
    reactStateTracker.capture = true;
    await act(async () => { request.reject(new PushSubscriptionError({ supported: true, permission: "granted", enabled: false })); await request.promise.catch(() => undefined); });

    expect(reactStateTracker.updates).toBe(0);
  });

  it("上方使用正式通知標題卡", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "通知設定", level: 1 })).toBeVisible();
  });

  it("依需求將通知分成兩個群組並保留獨立系統通知", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(within(screen.getByRole("region", { name: "一般通知" })).getAllByRole("article")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Matrix 通知" })).getAllByRole("article")).toHaveLength(4);
    expect(within(screen.getByRole("region", { name: "系統通知" })).getAllByRole("article")).toHaveLength(1);
  });

  it("在 Matrix Pro 通知名稱上方顯示相同標籤", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const expiryRow = document.querySelector<HTMLElement>('[data-notification-key="expiry"]');

    expect(expiryRow).not.toBeNull();
    expect(within(expiryRow!).getByText("Matrix Pro", { selector: "em" })).toBeVisible();
    expect(within(expiryRow!).getByText("Matrix Pro", { selector: "h2 > span" })).toBeVisible();
  });

  it("設定選項位於右側開關左側", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]');
    expect(betRow).not.toBeNull();

    const controls = betRow!.querySelector(".notification-actions");
    expect(controls).not.toBeNull();
    const buttons = within(controls as HTMLElement).getAllByRole("button");
    expect(buttons[0]).toHaveClass("notification-settings-toggle");
    expect(buttons[1]).toHaveClass("toggle");
  });

  it("選號提醒展開後不顯示彩種勾選框，只保留四彩種標題與兩列時間選擇", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]');
    expect(betRow).not.toBeNull();

    fireEvent.click(within(betRow!).getByRole("button", { name: /設定選項/ }));

    expect(within(betRow!).getByLabelText("第1組提醒時間")).toBeInTheDocument();
    expect(within(betRow!).getByLabelText("第2組提醒時間")).toBeInTheDocument();

    ["今彩539", "天天樂", "六合彩", "大樂透"].forEach((lottery) => {
      expect(within(betRow!).getByText(lottery)).toBeInTheDocument();
      expect(within(betRow!).queryByLabelText(lottery)).not.toBeInTheDocument();
      expect(within(betRow!).getByRole("combobox", { name: `${lottery}時間1` })).toBeInTheDocument();
      expect(within(betRow!).getByRole("combobox", { name: `${lottery}時間2` })).toBeInTheDocument();
    });
  });

  it("Matrix 狀態在列下方展開四彩種與四列狀態", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const statusRow = document.querySelector<HTMLElement>('[data-notification-key="status"]');
    expect(statusRow).not.toBeNull();

    fireEvent.click(within(statusRow!).getByRole("button", { name: /設定選項/ }));

    expect(within(statusRow!).getAllByText("啟動")).toHaveLength(4);
    expect(within(statusRow!).getAllByText("聚合")).toHaveLength(4);
    expect(within(statusRow!).getAllByText("共振")).toHaveLength(4);
    expect(within(statusRow!).getAllByText("臨界")).toHaveLength(4);
  });

  it("設定選項以可中斷的收合面板呈現並在收合時停止互動", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const statusRow = document.querySelector<HTMLElement>('[data-notification-key="status"]');
    expect(statusRow).not.toBeNull();
    const toggle = within(statusRow!).getByRole("button", { name: /設定選項/ });
    const panel = statusRow!.querySelector<HTMLElement>(".notification-inline-settings");

    expect(panel).not.toBeNull();
    expect(panel!.querySelector(":scope > .notification-inline-settings-inner > .notification-inline-settings-content")).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-controls", panel!.id);
    expect(panel).toHaveAttribute("data-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");

    fireEvent.click(toggle);
    expect(panel).toHaveAttribute("data-expanded", "true");
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(panel).not.toHaveAttribute("inert");

    fireEvent.click(toggle);
    expect(panel).toHaveAttribute("data-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
  });

  it("系統通知與 Matrix Pro 使用四等分選項列", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    for (const key of ["system", "expiry"] as const) {
      const row = document.querySelector<HTMLElement>(`[data-notification-key="${key}"]`);
      expect(row).not.toBeNull();
      fireEvent.click(within(row!).getByRole("button", { name: /設定選項/ }));
      expect(row!.querySelector(`[data-setting-key="${key}"]`)).not.toBeNull();
    }
  });

  it("載入登入會員已儲存的通知設定", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      settings: { ...storedSettings.settings, bet: false },
      betTimes: { ...storedSettings.betTimes, 今彩539: ["19:45", "20:00"] },
    });

    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]');
    expect(betRow).not.toBeNull();
    await waitFor(() => expect(within(betRow!).getByRole("button", { name: "開啟選號提醒" })).toHaveAttribute("data-checked", "false"));
    expect(memberApi.fetchNotificationSettings).toHaveBeenCalledTimes(1);
    expect(memberApi.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("變更既有通知控制後儲存完整會員設定", async () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]');
    expect(betRow).not.toBeNull();
    await waitFor(() => expect(memberApi.fetchNotificationSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(within(betRow!).getAllByRole("button")[1]);

    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...storedSettings,
      settings: { ...storedSettings.settings, bet: false },
    }));
  });

  it("載入並儲存 Matrix 狀態勾選清單", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      statusOptions: { ...storedSettings.statusOptions, 今彩539: ["啟動"] },
    });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const statusRow = document.querySelector<HTMLElement>('[data-notification-key="status"]');
    expect(statusRow).not.toBeNull();
    await waitFor(() => expect(memberApi.fetchNotificationSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(within(statusRow!).getByRole("button", { name: /設定選項/ }));
    expect(within(statusRow!).getAllByRole("checkbox", { name: "啟動" })[0]).toBeChecked();
    expect(within(statusRow!).getAllByRole("checkbox", { name: "聚合" })[0]).not.toBeChecked();

    fireEvent.click(within(statusRow!).getAllByRole("checkbox", { name: "聚合" })[0]);
    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...storedSettings,
      statusOptions: { ...storedSettings.statusOptions, 今彩539: ["啟動", "聚合"] },
    }));
  });

  it("保留載入期間的編輯並與遠端設定合併後儲存", async () => {
    const request = deferred<MemberNotificationSettings>();
    memberApi.fetchNotificationSettings.mockReturnValueOnce(request.promise);
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]')!;
    const resultRow = document.querySelector<HTMLElement>('[data-notification-key="result"]')!;
    const statusRow = document.querySelector<HTMLElement>('[data-notification-key="status"]')!;
    fireEvent.click(within(betRow).getByRole("button", { name: /設定選項/ }));
    fireEvent.change(within(betRow).getByRole("combobox", { name: "今彩539時間1" }), { target: { value: "19:45" } });
    fireEvent.click(within(resultRow).getByRole("button", { name: /設定選項/ }));
    fireEvent.click(within(resultRow).getByRole("checkbox", { name: "今彩539" }));
    fireEvent.click(within(statusRow).getByRole("button", { name: /設定選項/ }));
    fireEvent.click(within(statusRow).getAllByRole("checkbox", { name: "啟動" })[0]);
    fireEvent.click(within(betRow).getAllByRole("button")[1]);
    expect(within(betRow).getAllByRole("button")[1]).toHaveAttribute("data-checked", "false");

    const remoteSettings: MemberNotificationSettings = {
      ...structuredClone(storedSettings),
      settings: { ...storedSettings.settings, result: false },
    };
    await act(async () => {
      request.resolve(remoteSettings);
      await request.promise;
    });

    await waitFor(() => {
      expect(within(betRow).getAllByRole("button")[1]).toHaveAttribute("data-checked", "false");
      expect(within(resultRow).getAllByRole("button")[1]).toHaveAttribute("data-checked", "false");
    });
    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...remoteSettings,
      settings: { ...remoteSettings.settings, bet: false },
      selectedOptions: {
        ...remoteSettings.selectedOptions,
        result: ["天天樂", "六合彩", "大樂透"],
      },
      betTimes: { ...remoteSettings.betTimes, 今彩539: ["19:45", ""] },
      statusOptions: { ...remoteSettings.statusOptions, 今彩539: ["聚合", "共振", "臨界"] },
    }));
  });

  it("GET 失敗後不以本地預設值覆寫未知的遠端設定", async () => {
    const request = deferred<MemberNotificationSettings>();
    memberApi.fetchNotificationSettings.mockReturnValueOnce(request.promise);
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    await act(async () => {
      request.reject(new Error("network failed"));
      await request.promise.catch(() => undefined);
    });
    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]')!;
    fireEvent.click(within(betRow).getAllByRole("button")[1]);
    await act(async () => { await Promise.resolve(); });

    expect(memberApi.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("GET 成功後立即離頁不會把載入前的本地預設值寫回遠端", async () => {
    const request = deferred<MemberNotificationSettings>();
    memberApi.fetchNotificationSettings.mockReturnValueOnce(request.promise);
    const { unmount } = render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const remoteSettings: MemberNotificationSettings = {
      ...structuredClone(storedSettings),
      settings: { ...storedSettings.settings, bet: false },
    };

    await act(async () => {
      request.resolve(remoteSettings);
      await request.promise;
      unmount();
    });
    await act(async () => { await Promise.resolve(); });

    expect(memberApi.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("PUT 失敗後重試尚未確認的最新設定", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      settings: { ...storedSettings.settings, bet: false },
    });
    memberApi.saveNotificationSettings
      .mockRejectedValueOnce(new Error("network failed"))
      .mockImplementation(async (settings) => settings);
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]')!;
    const toggle = within(betRow).getAllByRole("button")[1];
    await waitFor(() => expect(toggle).toHaveAttribute("data-checked", "false"));
    fireEvent.click(toggle);

    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(2));
    const expected = {
      ...storedSettings,
      settings: { ...storedSettings.settings, bet: true },
    };
    expect(memberApi.saveNotificationSettings).toHaveBeenNthCalledWith(1, expected);
    expect(memberApi.saveNotificationSettings).toHaveBeenNthCalledWith(2, expected);
  });

  it("快速連續編輯只儲存合併後的最新快照", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      settings: { ...storedSettings.settings, bet: false },
    });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betToggle = within(document.querySelector<HTMLElement>('[data-notification-key="bet"]')!).getAllByRole("button")[1];
    const resultToggle = within(document.querySelector<HTMLElement>('[data-notification-key="result"]')!).getAllByRole("button")[1];
    const expiryToggle = within(document.querySelector<HTMLElement>('[data-notification-key="expiry"]')!).getAllByRole("button")[1];
    await waitFor(() => expect(betToggle).toHaveAttribute("data-checked", "false"));

    fireEvent.click(betToggle);
    fireEvent.click(resultToggle);
    fireEvent.click(expiryToggle);

    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(1);
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...storedSettings,
      settings: { ...storedSettings.settings, bet: true, result: false, expiry: false },
    });
  });

  it("離開頁面前儲存已載入且尚未送出的最新編輯", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      settings: { ...storedSettings.settings, bet: false },
    });
    const { unmount } = render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const betToggle = within(document.querySelector<HTMLElement>('[data-notification-key="bet"]')!).getAllByRole("button")[1];
    await waitFor(() => expect(betToggle).toHaveAttribute("data-checked", "false"));
    fireEvent.click(betToggle);
    unmount();

    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(1));
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...storedSettings,
      settings: { ...storedSettings.settings, bet: true },
    });
  });
});

it("儲存失敗顯示提示，保留編輯並可立即重試", async () => {
  vi.useFakeTimers();
  try {
    memberApi.saveNotificationSettings.mockRejectedValue(new Error("offline"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "全部關閉" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(25); });
    expect(screen.getByText("通知設定尚未儲存，請重試")).toBeVisible();
    const latest = memberApi.saveNotificationSettings.mock.calls.at(-1)![0];
    memberApi.saveNotificationSettings.mockResolvedValue(latest);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重試儲存通知設定" }));
    });
    expect(screen.queryByText("通知設定尚未儲存，請重試")).toBeNull();
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(2);
    expect(memberApi.saveNotificationSettings).toHaveBeenLastCalledWith(latest);
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

it("失敗後切回原設定仍確認儲存最新選擇，確認前保留提示", async () => {
  vi.useFakeTimers();
  try {
    memberApi.saveNotificationSettings.mockRejectedValueOnce(new Error("response lost"));
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "關閉選號提醒" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(25); });
    expect(screen.getByText("通知設定尚未儲存，請重試")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "開啟選號提醒" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重試儲存通知設定" }));
    });
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(2);
    expect(memberApi.saveNotificationSettings).toHaveBeenLastCalledWith(storedSettings);
    expect(screen.queryByText("通知設定尚未儲存，請重試")).toBeNull();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

