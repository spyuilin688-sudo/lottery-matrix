// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberNotificationSettings } from "../member-api";

const memberApi = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
}));

vi.mock("../member-api", () => ({
  fetchNotificationSettings: memberApi.fetchNotificationSettings,
  saveNotificationSettings: memberApi.saveNotificationSettings,
}));

import { NotificationsPagePatched } from "../NotificationsPagePatched";

afterEach(cleanup);

const storedSettings: MemberNotificationSettings = {
  settings: { bet: true, result: true, win: true, status: true, card: true, collision: false, system: true, expiry: true },
  selectedOptions: {
    result: ["今彩539", "天天樂", "六合彩", "大樂透"],
    win: ["彩種通知"],
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
  memberApi.fetchNotificationSettings.mockReset().mockResolvedValue(structuredClone(storedSettings));
  memberApi.saveNotificationSettings.mockReset().mockImplementation(async (settings) => settings);
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

describe("NotificationsPagePatched", () => {
  it("依需求將通知分成兩個群組並保留獨立系統通知", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(within(screen.getByRole("region", { name: "一般通知" })).getAllByRole("article")).toHaveLength(3);
    expect(within(screen.getByRole("region", { name: "Matrix 通知" })).getAllByRole("article")).toHaveLength(4);
    expect(within(screen.getByRole("region", { name: "系統通知" })).getAllByRole("article")).toHaveLength(1);
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

  it("中獎通知、系統通知與 Matrix Pro 使用四等分選項列", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    for (const key of ["win", "system", "expiry"] as const) {
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
    await waitFor(() => expect(within(betRow!).getByRole("button", { name: "" })).toHaveAttribute("data-checked", "false"));
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

  it("載入並儲存 Matrix 狀態的彩種啟用清單", async () => {
    memberApi.fetchNotificationSettings.mockResolvedValueOnce({
      ...structuredClone(storedSettings),
      selectedOptions: { ...storedSettings.selectedOptions, status: ["今彩539"] },
    });
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    const statusRow = document.querySelector<HTMLElement>('[data-notification-key="status"]');
    expect(statusRow).not.toBeNull();
    await waitFor(() => expect(memberApi.fetchNotificationSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(within(statusRow!).getByRole("button", { name: /設定選項/ }));
    expect(within(statusRow!).getByRole("checkbox", { name: "今彩539" })).toBeChecked();
    expect(within(statusRow!).getByRole("checkbox", { name: "天天樂" })).not.toBeChecked();

    fireEvent.click(within(statusRow!).getByRole("checkbox", { name: "天天樂" }));
    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...storedSettings,
      selectedOptions: { ...storedSettings.selectedOptions, status: ["今彩539", "天天樂"] },
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
    fireEvent.click(within(statusRow).getByRole("checkbox", { name: "天天樂" }));
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
        status: ["今彩539", "六合彩", "大樂透"],
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
    const winToggle = within(document.querySelector<HTMLElement>('[data-notification-key="win"]')!).getAllByRole("button")[1];
    await waitFor(() => expect(betToggle).toHaveAttribute("data-checked", "false"));

    fireEvent.click(betToggle);
    fireEvent.click(resultToggle);
    fireEvent.click(winToggle);

    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(1);
    expect(memberApi.saveNotificationSettings).toHaveBeenCalledWith({
      ...storedSettings,
      settings: { ...storedSettings.settings, bet: true, result: false, win: false },
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
