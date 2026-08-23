// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsPagePatched } from "../NotificationsPagePatched";

afterEach(cleanup);

describe("NotificationsPagePatched", () => {
  it("依需求將通知分成兩個群組並保留獨立系統通知", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(within(screen.getByRole("region", { name: "一般通知" })).getAllByRole("article")).toHaveLength(3);
    expect(within(screen.getByRole("region", { name: "Matrix 通知" })).getAllByRole("article")).toHaveLength(4);
    expect(within(screen.getByRole("region", { name: "系統通知" })).getAllByRole("article")).toHaveLength(1);
  });

  it("選號提醒在列下方展開四彩種與兩列時間選擇", () => {
    render(<NotificationsPagePatched onNavigate={vi.fn()} />);
    const betRow = document.querySelector<HTMLElement>('[data-notification-key="bet"]');
    expect(betRow).not.toBeNull();

    fireEvent.click(within(betRow!).getByRole("button", { name: /設定選項/ }));

    ["今彩539", "天天樂", "六合彩", "大樂透"].forEach((lottery) => {
      expect(within(betRow!).getByLabelText(lottery)).toBeChecked();
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
});
