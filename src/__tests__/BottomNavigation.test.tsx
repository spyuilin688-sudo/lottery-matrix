// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; app compilation intentionally omits global Node types.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation, HomeQuickSettingsButton } from "../BottomNavigation";
import { QuickNavigationProvider } from "../features/navigation";
import { FeatureBottomNavigationPortal } from "../features/shared";

declare const process: { cwd(): string };

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("BottomNavigation", () => {
  it("renders an explicit click owner instead of spreading event props", () => {
    const source = readFileSync(`${process.cwd()}/src/BottomNavigation.tsx`, "utf8");
    const renderedButton = source.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "";

    expect(renderedButton).toContain('onClick={label === "快捷" ? onQuickOpen');
    expect(renderedButton).not.toContain("{...quickProps}");
  });

  it("依序提供首頁、快捷、計算機、我的四個獨立入口", () => {
    render(<BottomNavigation />);
    const buttons = within(screen.getByRole("navigation", { name: "底部導覽" })).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["首頁", "快捷", "計算機", "我的"]);
  });

  it.each(["首頁", "快捷", "計算機", "我的"] as const)(
    "只讓目前頁面 %s 顯示選取狀態",
    (active) => {
      render(<BottomNavigation active={active} />);

      const navigation = screen.getByRole("navigation", { name: "底部導覽" });
      const selectedItems = within(navigation)
        .getAllByRole("button")
        .filter((button) => button.getAttribute("data-selected") === "true");

      expect(selectedItems).toHaveLength(1);
      expect(selectedItems[0]).toHaveAccessibleName(
        active,
      );
      expect(navigation).toHaveAttribute("data-active", active);
      expect(within(selectedItems[0]).getByText(active)).toBeVisible();
    },
  );

  it("快捷功能開啟時會取代其他頁面的選取狀態", () => {
    render(<BottomNavigation active="計算機" quickActive />);

    expect(screen.getByRole("navigation", { name: "底部導覽" })).toHaveAttribute(
      "data-active",
      "快捷",
    );
    expect(screen.getByRole("button", { name: "快捷" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "計算機" })).toHaveAttribute(
      "data-selected",
      "false",
    );
  });

  it("快捷按鈕的原生點擊會開啟快捷功能", () => {
    const onQuickOpen = vi.fn();
    render(<BottomNavigation onQuickOpen={onQuickOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "快捷" }));

    expect(onQuickOpen).toHaveBeenCalledTimes(1);
  });

  it.each([[false, "計算機"], [true, "快捷"]] as const)(
    "計算機實際路由與快捷覆蓋狀態 %s 決定共用導覽選中項",
    (quickActive, label) => {
      render(
        <div className="mobile-page">
          <QuickNavigationProvider currentScreen="calculator" quickActive={quickActive}>
            <FeatureBottomNavigationPortal active="首頁" onNavigate={vi.fn()} />
          </QuickNavigationProvider>
        </div>,
      );
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("button", { name: "首頁" })).not.toHaveAttribute("aria-current");
    },
  );

  it("通知頁由新的會員入口進入後將我的標示為目前群組", () => {
    render(<BottomNavigation active="通知" />);
    expect(screen.getByRole("button", { name: "我的" })).toHaveAttribute("aria-current", "page");
  });

  it("快捷設定由頁首擁有，底部保留四個獨立導覽入口", () => {
    const onQuickConfigure = vi.fn();
    render(<><header><HomeQuickSettingsButton onOpen={onQuickConfigure} /></header><BottomNavigation /></>);
    const settings = screen.getByRole("button", { name: /快捷設定/ });
    expect(screen.getByRole("banner")).toContainElement(settings);
    expect(screen.getByRole("navigation")).not.toContainElement(settings);
    expect(within(screen.getByRole("navigation")).getAllByRole("button")).toHaveLength(4);
    expect(onQuickConfigure).not.toHaveBeenCalled();
  });

  it("快捷設定保留鍵盤及輔助操作的原生 click 入口", () => {
    const onQuickConfigure = vi.fn();
    render(<HomeQuickSettingsButton onOpen={onQuickConfigure} />);

    fireEvent.click(screen.getByRole("button", { name: /快捷設定/ }), { detail: 0 });

    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
  });

  it.each([500, 799])("快捷設定與自訂觸發條件一樣雙擊開啟，兩次點擊相隔 %ims", (intervalMs) => {
    vi.useFakeTimers();
    const onQuickConfigure = vi.fn();
    const onQuickOpen = vi.fn();
    render(<><HomeQuickSettingsButton onOpen={onQuickConfigure} /><BottomNavigation onQuickOpen={onQuickOpen} /></>);
    const settingsButton = screen.getByRole("button", { name: "快捷設定，連續點擊兩下開啟" });

    fireEvent.click(settingsButton, { detail: 1 });
    vi.advanceTimersByTime(intervalMs);
    expect(onQuickConfigure).not.toHaveBeenCalled();

    fireEvent.click(settingsButton, { detail: 1 });
    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
    expect(onQuickOpen).not.toHaveBeenCalled();

    fireEvent.click(settingsButton, { detail: 1 });
    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
  });

  it("快捷設定沿用既有雙擊判定，間隔達 800ms 的點擊不開啟", () => {
    vi.useFakeTimers();
    const onQuickConfigure = vi.fn();
    render(<HomeQuickSettingsButton onOpen={onQuickConfigure} />);
    const settingsButton = screen.getByRole("button", { name: /快捷設定/ });

    fireEvent.click(settingsButton, { detail: 1 });
    vi.advanceTimersByTime(800);
    fireEvent.click(settingsButton, { detail: 1 });
    expect(onQuickConfigure).not.toHaveBeenCalled();
  });

  it.each([
    ["首頁", "home"],
    ["計算機", "calculator"],
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

    const quickButton = screen.getByRole("button", { name: "快捷" });
    fireEvent.pointerDown(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.pointerUp(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });

    expect(onQuickOpen).not.toHaveBeenCalled();

    fireEvent.click(quickButton);

    expect(onQuickOpen).toHaveBeenCalledTimes(1);
  });

});
