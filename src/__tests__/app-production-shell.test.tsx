// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getAllByRole("button", { name: /展開版路/ })).toHaveLength(4);
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

  it("restores the four deployed preview results without changing the member app", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    expect(screen.getByText(/探索到/).parentElement).toHaveTextContent("探索到 4 組符合條件版路");
    for (const id of ["result-04", "result-09", "result-07", "result-14"]) {
      expect(screen.getByRole("button", { name: `展開版路 ${id}` })).toBeInTheDocument();
    }
  });

  it("allows more than one preview result to stay expanded", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    expect(screen.getByRole("region", { name: "04 驗證過程" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "09 驗證過程" })).toBeInTheDocument();
  });

  it("uses the approved one-line summary format", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    expect(document.querySelector(".explore-validation-summary")?.textContent)
      .toBe("開 04 第 1 顆  |  同期  |  第 4 顆  |  +24.36  |  下 1 期開");
  });

  it("keeps the consecutive tag as a direct child of the summary card", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const summary = document.querySelector(".explore-validation-summary-card");
    expect(summary).not.toBeNull();
    expect(summary?.querySelector(":scope > .explore-validation-consecutive-tag")).toHaveTextContent("準6進7");
  });

  it("renders issue, number, and formula columns as independent cards", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-14" }));

    const firstGroup = document.querySelector(".explore-validation-group");
    expect(firstGroup).not.toBeNull();
    expect(firstGroup?.children).toHaveLength(3);
    expect(firstGroup?.children[0]).toHaveClass("explore-validation-issues");
    expect(firstGroup?.children[1]).toHaveClass("explore-validation-numbers-card");
    expect(firstGroup?.children[2]).toHaveClass("explore-validation-formulas");
  });

  it("limits every validation group to at most three rows", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-14" }));

    for (const group of document.querySelectorAll(".explore-validation-group")) {
      expect(within(group as HTMLElement).getAllByText(/^\d{5}$/).length).toBeLessThanOrEqual(3);
    }
  });

  it("inserts one half-width space before formula plus signs", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    expect(screen.getAllByText("第2顆 09 +21 = 30").length).toBeGreaterThan(0);
  });

  it("keeps the scoped tag selector and responsive three-column dimensions", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-summary-card\s*>\s*\.explore-validation-consecutive-tag\s*\{/);
    expect(css).toMatch(/font-size:\s*8px/);
    expect(css).toMatch(/grid-template-columns:\s*clamp\(44px,\s*12\.31vw,\s*48px\)\s+minmax\(0,\s*1fr\)\s+clamp\(110px,\s*32\.82vw,\s*128px\)/);
    expect(css).toMatch(/column-gap:\s*2px/);
    expect(css).toMatch(/row-gap:\s*3px/);
    expect(css).not.toContain("!important");
  });

  it("keeps issue and formula typography aligned with the approved mobile layout", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-issue\s*\{[^}]*font-size:\s*9px[^}]*font-weight:\s*700/s);
    expect(css).toMatch(/\.explore-validation-formula-row\s*\{[^}]*padding:\s*0 6px/s);
    expect(css).toMatch(/\.explore-validation-summary\s*\{[^}]*padding:\s*4px 8px/s);
  });

  it("keeps the complete expanded validation area independent from reference page classes", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const validation = screen.getByRole("region", { name: "04 驗證過程" });
    expect(validation).toHaveClass("explore-validation-card");
    expect(validation.querySelector('[class^="reference-"], [class*=" reference-"]')).toBeNull();
  });

  it("keeps issue numbers at 9px and 700 when the shared reference rule loads later", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const previewStyle = document.createElement("style");
    previewStyle.textContent = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");
    const sharedStyle = document.createElement("style");
    sharedStyle.textContent = ".reference-issue { font: inherit; }";
    document.head.append(previewStyle, sharedStyle);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const issue = document.querySelector(".explore-validation-issue");
    expect(issue).not.toBeNull();
    expect(getComputedStyle(issue!).fontSize).toBe("9px");
    expect(getComputedStyle(issue!).fontWeight).toBe("700");

    previewStyle.remove();
    sharedStyle.remove();
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
