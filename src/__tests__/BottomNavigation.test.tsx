// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; app compilation intentionally omits global Node types.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "../BottomNavigation";

declare const process: { cwd(): string };

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("BottomNavigation", () => {
  it("renders an explicit click owner instead of spreading event props", () => {
    const source = readFileSync(`${process.cwd()}/src/BottomNavigation.tsx`, "utf8");
    const renderedButton = source.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "";

    expect(renderedButton).toContain('onClick={label === "快捷" ? handleQuickClick');
    expect(renderedButton).not.toContain("{...quickProps}");
  });

  it.each([
    ["首頁", "/assets/lottery/functions/matrixWW1.png"],
    ["快捷", "/assets/lottery/functions/matrixWW2.png"],
    ["通知", "/assets/lottery/functions/matrixWW3.png"],
    ["我的", "/assets/lottery/functions/matrixWW4.png"],
  ] as const)("依目前選取入口 %s 切換正式底圖", (active, artwork) => {
    render(<BottomNavigation active={active} />);

    expect(screen.getByRole("img", { name: "Matrix 底部導覽" })).toHaveAttribute("src", artwork);
    expect(screen.getByRole("button", { name: active === "快捷" ? "快捷；長按三秒開啟設定" : active })).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  it.each(["首頁", "快捷", "通知", "我的"] as const)(
    "只讓目前頁面 %s 顯示選取發光狀態",
    (active) => {
      render(<BottomNavigation active={active} />);

      const navigation = screen.getByRole("navigation", { name: "底部導覽" });
      const selectedItems = within(navigation)
        .getAllByRole("button")
        .filter((button) => button.getAttribute("data-selected") === "true");

      expect(selectedItems).toHaveLength(1);
      expect(selectedItems[0]).toHaveAccessibleName(
        active === "快捷" ? "快捷；長按三秒開啟設定" : active,
      );
      expect(navigation).toHaveAttribute("data-active", active);
      expect(within(selectedItems[0]).getByText(active)).toBeVisible();
    },
  );

  it("快捷功能開啟時會取代其他頁面的選取狀態", () => {
    render(<BottomNavigation active="通知" quickActive />);

    expect(screen.getByRole("navigation", { name: "底部導覽" })).toHaveAttribute(
      "data-active",
      "快捷",
    );
    expect(screen.getByRole("button", { name: "快捷；長按三秒開啟設定" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "通知" })).toHaveAttribute(
      "data-selected",
      "false",
    );
  });

  it("快捷按鈕的原生點擊會開啟快捷功能", () => {
    const onQuickOpen = vi.fn();
    render(<BottomNavigation onQuickOpen={onQuickOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "快捷；長按三秒開啟設定" }));

    expect(onQuickOpen).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["首頁", "home"],
    ["通知", "notifications"],
    ["我的", "profile"],
  ] as const)("一般入口 %s 每次點擊只導向一次", (label, target) => {
    const onNavigate = vi.fn();
    const onQuickOpen = vi.fn();
    render(<BottomNavigation onNavigate={onNavigate} onQuickOpen={onQuickOpen} />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(target);
    expect(onQuickOpen).not.toHaveBeenCalled();
  });

  it("快捷短按只在 click 開啟，pointer up 不提前切換頁面", () => {
    const onQuickOpen = vi.fn();
    render(<BottomNavigation onQuickOpen={onQuickOpen} />);

    const quickButton = screen.getByRole("button", { name: "快捷；長按三秒開啟設定" });
    fireEvent.pointerDown(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.pointerUp(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });

    expect(onQuickOpen).not.toHaveBeenCalled();

    fireEvent.click(quickButton);

    expect(onQuickOpen).toHaveBeenCalledTimes(1);
  });

  it("pointer cancel 會取消快捷長按計時", () => {
    vi.useFakeTimers();
    const onQuickOpen = vi.fn();
    const onQuickConfigure = vi.fn();

    render(<BottomNavigation onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />);

    const quickButton = screen.getByRole("button", { name: "快捷；長按三秒開啟設定" });
    fireEvent.pointerDown(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.pointerCancel(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    vi.advanceTimersByTime(3000);

    expect(onQuickConfigure).not.toHaveBeenCalled();
    expect(onQuickOpen).not.toHaveBeenCalled();
  });

  it("手機 Pointer 長按三秒會開啟快捷設定且不觸發快捷功能", () => {
    vi.useFakeTimers();
    const onQuickOpen = vi.fn();
    const onQuickConfigure = vi.fn();

    render(<BottomNavigation onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />);

    const quickButton = screen.getByRole("button", { name: "快捷；長按三秒開啟設定" });
    fireEvent.pointerDown(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    vi.advanceTimersByTime(3000);
    fireEvent.pointerUp(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.click(quickButton);

    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
    expect(onQuickOpen).not.toHaveBeenCalled();
  });
});
