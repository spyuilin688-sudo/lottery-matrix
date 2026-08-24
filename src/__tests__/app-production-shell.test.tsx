// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("renders the member app without the virtual phone frame", () => {
    window.history.replaceState({}, "", "/");

    render(<App />);

    expect(screen.getByText("member-root")).toBeInTheDocument();
    expect(screen.queryByTestId("phone-frame")).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-screen")).not.toBeInTheDocument();
    expect(bridge.render).toHaveBeenCalledTimes(1);
  });

  it("keeps the removed visual auth gate and stylesheet out of the app shell", () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");

    expect(source).toContain('from "./auth/MemberSessionBridge"');
    expect(source).not.toContain("LineAuthGate");
    expect(source).not.toContain("line-login.css");
  });
});
