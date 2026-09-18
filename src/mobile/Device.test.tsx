// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; app compilation intentionally omits global Node types.
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevicePicker, MobileDeviceProvider } from "./Device";

const deviceSource = readFileSync("src/mobile/Device.tsx", "utf8");

function renderPicker() {
  render(
    <MobileDeviceProvider>
      <DevicePicker />
    </MobileDeviceProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperties(HTMLElement.prototype, {
    scrollIntoView: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DevicePicker", () => {
  it("makes the Radix trigger the interactive element instead of delegating to a nested button", () => {
    const triggerStart = deviceSource.indexOf("<DropdownMenu.Trigger");
    const triggerEnd = deviceSource.indexOf("</DropdownMenu.Trigger>", triggerStart);
    const triggerSource = deviceSource.slice(triggerStart, triggerEnd);

    expect(triggerStart).toBeGreaterThan(-1);
    expect(triggerEnd).toBeGreaterThan(triggerStart);
    expect(triggerSource).toContain('className="device-picker-trigger"');
    expect(triggerSource).toContain('data-testid="device-picker"');
    expect(triggerSource).toContain("aria-label={`Preview device: ${device.label}`}");
    expect(triggerSource).not.toContain("asChild");
    expect(triggerSource).not.toContain("<button");
  });

  it("opens from a pointer click, updates the selected device, and restores trigger focus", async () => {
    renderPicker();
    const trigger = screen.getByRole("button", { name: "Preview device: iPhone" });

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });

    const pixel = await screen.findByRole("menuitemradio", { name: "Pixel 10" });
    fireEvent.click(pixel);

    const updatedTrigger = await screen.findByRole("button", { name: "Preview device: Pixel 10" });
    await waitFor(() => expect(updatedTrigger).toHaveFocus());
  });

  it("opens from keyboard Enter and keeps the current option identified", async () => {
    renderPicker();
    const trigger = screen.getByRole("button", { name: "Preview device: iPhone" });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("menuitemradio", { name: "iPhone" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("menuitemradio", { name: "Pixel 10" })).toHaveAttribute("data-state", "unchecked");
  });
});
