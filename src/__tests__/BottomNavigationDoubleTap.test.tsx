// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "../BottomNavigation";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("BottomNavigation 快捷設定雙擊", () => {
  it("800ms 內連續點擊兩下才開啟設定", () => {
    vi.useFakeTimers();
    const onQuickConfigure = vi.fn();
    render(<BottomNavigation onQuickConfigure={onQuickConfigure} showQuickSettings />);

    const button = screen.getByRole("button", { name: "快捷設定，連續點擊兩下開啟" });
    fireEvent.click(button, { detail: 1 });
    vi.advanceTimersByTime(799);
    expect(onQuickConfigure).not.toHaveBeenCalled();

    fireEvent.click(button, { detail: 1 });
    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
  });

  it("兩次點擊達 800ms 不開啟設定", () => {
    vi.useFakeTimers();
    const onQuickConfigure = vi.fn();
    render(<BottomNavigation onQuickConfigure={onQuickConfigure} showQuickSettings />);

    const button = screen.getByRole("button", { name: "快捷設定，連續點擊兩下開啟" });
    fireEvent.click(button, { detail: 1 });
    vi.advanceTimersByTime(800);
    fireEvent.click(button, { detail: 1 });

    expect(onQuickConfigure).not.toHaveBeenCalled();
  });

  it("鍵盤或輔助操作的合成 click 可單次開啟設定", () => {
    const onQuickConfigure = vi.fn();
    render(<BottomNavigation onQuickConfigure={onQuickConfigure} showQuickSettings />);

    fireEvent.click(screen.getByRole("button", { name: "快捷設定，連續點擊兩下開啟" }), { detail: 0 });

    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
  });
});
