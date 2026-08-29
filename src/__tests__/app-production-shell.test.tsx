// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const bridge = vi.hoisted(() => ({ render: vi.fn(() => null) }));

vi.mock("../admin/AdminApp", () => ({ default: () => <div>admin-root</div> }));
vi.mock("../auth/MemberSessionBridge", () => ({ MemberSessionBridge: bridge.render }));
vi.mock("../Prototype", () => ({ default: () => <div>member-root</div> }));

import App from "../App";

afterEach(cleanup);

describe("production member shell", () => {
  it("renders the isolated exploration result page only on its direct path", () => {
    window.history.replaceState({}, "", "/explore-result-preview");

    render(<App />);

    expect(screen.getByRole("main", { name: "探索結果區" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "探索結果區" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /展開版路/ })).toBeInTheDocument();
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
  });

  it("keeps the isolated exploration result page available when the path has a trailing slash", () => {
    window.history.replaceState({}, "", "/explore-result-preview/");

    render(<App />);

    expect(screen.getByRole("main", { name: "探索結果區" })).toBeInTheDocument();
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
  });

  it("keeps the copied consecutive filter interactive on the isolated page", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "連準篩選" }));

    expect(screen.getByRole("dialog", { name: "連準篩選" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(screen.queryByRole("dialog", { name: "連準篩選" })).not.toBeInTheDocument();
  });

  it("renders the member app without the virtual phone frame", () => {
    window.history.replaceState({}, "", "/");

    render(<App />);

    expect(screen.getByText("member-root")).toBeInTheDocument();
    expect(screen.queryByTestId("phone-frame")).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-screen")).not.toBeInTheDocument();
    expect(bridge.render).toHaveBeenCalledTimes(1);
  });

  it("keeps the production member app inside a fluid mobile canvas capped at 430px", () => {
    window.history.replaceState({}, "", "/");
    const style = document.createElement("style");
    style.textContent = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    document.head.append(style);

    render(<App />);

    const canvas = screen.getByTestId("app-mobile-canvas");
    expect(canvas).toContainElement(
      screen.getByText("member-root"),
    );
    const canvasStyles = getComputedStyle(canvas);
    expect(canvasStyles.position).toBe("relative");
    expect(canvasStyles.width).toBe("100%");
    expect(canvasStyles.maxWidth).toBe("var(--app-layout-max)");
    expect(canvasStyles.marginInline).toBe("auto");
    expect(canvasStyles.overflow).toBe("hidden");
    expect(canvasStyles.contain).toBe("layout paint");
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--app-layout-max")
        .trim(),
    ).toBe("430px");

    style.remove();
  });

  it("keeps the removed visual auth gate and stylesheet out of the app shell", () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");

    expect(source).toContain('from "./auth/MemberSessionBridge"');
    expect(source).not.toContain("LineAuthGate");
    expect(source).not.toContain("line-login.css");
  });
});
