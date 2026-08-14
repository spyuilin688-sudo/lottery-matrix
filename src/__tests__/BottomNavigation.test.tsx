// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BottomNavigation } from "../BottomNavigation";

afterEach(cleanup);

describe("BottomNavigation", () => {
  it("依目前選取入口切換 matrixWW 正式底圖", () => {
    render(<BottomNavigation active="通知" />);

    expect(screen.getByRole("img", { name: "Matrix 底部導覽" })).toHaveAttribute(
      "src",
      "/assets/lottery/functions/matrixWW3.png",
    );
    expect(screen.getByRole("button", { name: "通知" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "首頁" })).toHaveAttribute(
      "data-selected",
      "false",
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
});
