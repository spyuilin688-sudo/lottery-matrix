import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "../BottomNavigation";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BottomNavigation 快捷設定", () => {
  it("兩次手機點擊相隔 500ms 仍會開啟設定", () => {
    vi.useFakeTimers();
    const onQuickConfigure = vi.fn();

    render(
      <BottomNavigation
        active="首頁"
        showQuickSettings
        onQuickConfigure={onQuickConfigure}
      />,
    );

    const settingsButton = screen.getByRole("button", { name: /快捷設定/ });
    fireEvent.click(settingsButton, { detail: 1 });
    vi.advanceTimersByTime(500);
    fireEvent.click(settingsButton, { detail: 1 });

    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
  });
});
