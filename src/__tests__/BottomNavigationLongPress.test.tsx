// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "../BottomNavigation";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("BottomNavigation 快捷長按", () => {
  it("持續按住快捷滿 1.5 秒才開啟設定，並抑制放開後的 click", () => {
    vi.useFakeTimers();
    const onQuickOpen = vi.fn();
    const onQuickConfigure = vi.fn();
    render(<BottomNavigation onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />);

    const quickButton = screen.getByRole("button", { name: "快捷；長按 1.5 秒開啟設定" });
    fireEvent.pointerDown(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });

    vi.advanceTimersByTime(1499);
    expect(onQuickConfigure).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onQuickConfigure).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(quickButton, { pointerId: 1, pointerType: "touch", button: 0 });
    fireEvent.click(quickButton);

    expect(onQuickConfigure).toHaveBeenCalledTimes(1);
    expect(onQuickOpen).not.toHaveBeenCalled();
  });

  it("未滿 1.5 秒放開時取消計時並保留原本點按功能", () => {
    vi.useFakeTimers();
    const onQuickOpen = vi.fn();
    const onQuickConfigure = vi.fn();
    render(<BottomNavigation onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />);

    const quickButton = screen.getByRole("button", { name: "快捷；長按 1.5 秒開啟設定" });
    fireEvent.pointerDown(quickButton, { pointerId: 2, pointerType: "touch", button: 0 });
    vi.advanceTimersByTime(1000);
    fireEvent.pointerUp(quickButton, { pointerId: 2, pointerType: "touch", button: 0 });
    vi.advanceTimersByTime(500);
    fireEvent.click(quickButton);

    expect(onQuickConfigure).not.toHaveBeenCalled();
    expect(onQuickOpen).toHaveBeenCalledTimes(1);
  });

  it("pointer cancel 會取消尚未完成的長按", () => {
    vi.useFakeTimers();
    const onQuickConfigure = vi.fn();
    render(<BottomNavigation onQuickConfigure={onQuickConfigure} />);

    const quickButton = screen.getByRole("button", { name: "快捷；長按 1.5 秒開啟設定" });
    fireEvent.pointerDown(quickButton, { pointerId: 3, pointerType: "touch", button: 0 });
    vi.advanceTimersByTime(1000);
    fireEvent.pointerCancel(quickButton, { pointerId: 3, pointerType: "touch", button: 0 });
    vi.advanceTimersByTime(500);

    expect(onQuickConfigure).not.toHaveBeenCalled();
  });
});
