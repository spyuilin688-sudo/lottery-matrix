// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "../BottomNavigation";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("BottomNavigation", () => {
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

  it("快捷長按期間移出按鈕範圍仍會在三秒後開啟設定", () => {
    vi.useFakeTimers();
    const onQuickOpen = vi.fn();
    const onQuickConfigure = vi.fn();

    render(
      <BottomNavigation
        onQuickOpen={onQuickOpen}
        onQuickConfigure={onQuickConfigure}
      />,
    );

    const quickButton = screen.getByRole("button", { name: "快捷；長按三秒開啟設定" });
    fireEvent.pointerDown(quickButton);
    fireEvent.pointerLeave(quickButton);
    vi.advanceTimersByTime(3000);

    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
    expect(onQuickOpen).not.toHaveBeenCalled();
  });
});
