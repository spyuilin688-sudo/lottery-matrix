// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const matrixCards = vi.hoisted(() => ({
  fetchMatrixCardManifest: vi.fn(),
  matrixCardUrl: vi.fn((path: string) => `https://matrix.example.test${path}`),
}));

vi.mock("../lottery-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lottery-api")>()),
  fetchMatrixCardManifest: matrixCards.fetchMatrixCardManifest,
  matrixCardUrl: matrixCards.matrixCardUrl,
}));

import { FeaturePageRouter, MatrixCardPage, MatrixNotebookPage, NotesPage } from "../FeaturePages";
import { AppDialogProvider } from "../dialog/AppDialog";

function openNotebookSettings() {
  render(<AppDialogProvider><MatrixNotebookPage onNavigate={vi.fn()} /></AppDialogProvider>);
  fireEvent.click(screen.getByRole("button", { name: "切換至紀錄模式" }));
  fireEvent.click(screen.getByRole("button", { name: "設定" }));
  fireEvent.click(screen.getByRole("button", { name: "編輯" }));
}

function tagOrder() {
  return Array.from(document.querySelectorAll<HTMLElement>(".tag-setting-card > header > strong"))
    .map((element) => element.textContent);
}

function reorderLabel(name: string, position: number, total = 4) {
  const clickDirection = position === total ? "上移" : "下移";
  return `調整${name}順序，目前第${position}項，共${total}項；點擊${clickDirection}，方向鍵可調整`;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  matrixCards.fetchMatrixCardManifest.mockReset().mockResolvedValue({
    lottery: "今彩539",
    period: "115000001",
    cards: {
      draw: { url: "/api/matrix/cards/今彩539/draw.svg" },
      sorted: { url: "/api/matrix/cards/今彩539/sorted.svg" },
    },
  });
  matrixCards.matrixCardUrl.mockReset().mockImplementation((path: string) => `https://matrix.example.test${path}`);
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("existing feature actions", () => {
  it("downloads the current Matrix ticket once, exposes pending failure, and permits retry", async () => {
    let rejectDownload!: (reason: Error) => void;
    const fetchCard = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectDownload = reject; }))
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["<svg />"], { type: "image/svg+xml" }) });
    vi.stubGlobal("fetch", fetchCard);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:matrix-ticket");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickedAnchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });
    render(<MatrixCardPage onNavigate={vi.fn()} />);

    const ticket = document.querySelector<HTMLElement>(".matrix-ticket");
    const button = await screen.findByRole("button", { name: "下載牌單" });
    await screen.findByRole("img", { name: "今彩539落球牌單，第 115000001 期" });
    expect(ticket).not.toBeNull();
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(fetchCard).toHaveBeenCalledWith("https://matrix.example.test/api/matrix/cards/今彩539/draw.svg");
    expect(fetchCard).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(fetchCard).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectDownload(new Error("private renderer detail"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("下載失敗，請稍後再試");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-busy", "false");

    fireEvent.click(button);

    await waitFor(() => expect(fetchCard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:matrix-ticket");
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe("今彩539-落球牌單.svg");
  });

  it("routes the existing invite action and disables actions without approved mutations", () => {
    const onNavigate = vi.fn();
    const { unmount } = render(<FeaturePageRouter screen="activation-code" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "邀請好友" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("invite-friends");

    const referralCard = screen.getByRole("heading", { name: "輸入推薦碼" }).closest("section");
    expect(referralCard).not.toBeNull();
    const referralConfirm = within(referralCard!).getByRole("button", { name: "確認" });
    expect(referralConfirm).toBeDisabled();
    expect(referralConfirm).toHaveClass("primary-action", "branded-explore-action");
    unmount();

    render(<NotesPage onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "紀錄設定" })).toBeDisabled();
  });

  it("keeps the activation-code input collapsed until the user opens it", () => {
    render(<FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "啟動碼" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "啟動碼" })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "啟動碼" })).toBeVisible();
    const activationConfirm = within(document.getElementById("activation-code-panel")!).getByRole("button", { name: "確認" });
    expect(activationConfirm).toBeEnabled();
    expect(activationConfirm).toHaveClass("primary-action", "branded-explore-action");
  });
});

describe("notebook tag ordering", () => {
  it("clicking a reorder control moves down once, or up once when already last", () => {
    openNotebookSettings();

    fireEvent.click(screen.getByRole("button", { name: reorderLabel("單號", 1) }));
    expect(tagOrder()).toEqual(["二星", "單號", "三星", "四星"]);

    fireEvent.click(screen.getByRole("button", { name: reorderLabel("四星", 4) }));
    expect(tagOrder()).toEqual(["二星", "單號", "四星", "三星"]);
  });

  it("ArrowUp and ArrowDown stay bounded, retain focus, and keep the position label accurate", async () => {
    openNotebookSettings();
    const first = screen.getByRole("button", { name: reorderLabel("單號", 1) });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(tagOrder()).toEqual(["單號", "二星", "三星", "四星"]);
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "ArrowDown" });
    let moved = await screen.findByRole("button", { name: reorderLabel("單號", 2) });
    expect(tagOrder()).toEqual(["二星", "單號", "三星", "四星"]);
    expect(moved).toHaveFocus();

    fireEvent.keyDown(moved, { key: "ArrowDown" });
    moved = await screen.findByRole("button", { name: reorderLabel("單號", 3) });
    fireEvent.keyDown(moved, { key: "ArrowDown" });
    moved = await screen.findByRole("button", { name: reorderLabel("單號", 4) });
    expect(tagOrder()).toEqual(["二星", "三星", "四星", "單號"]);
    expect(moved).toHaveFocus();

    fireEvent.keyDown(moved, { key: "ArrowDown" });
    expect(tagOrder()).toEqual(["二星", "三星", "四星", "單號"]);
    expect(moved).toHaveFocus();

    fireEvent.keyDown(moved, { key: "ArrowUp" });
    const movedUp = await screen.findByRole("button", { name: reorderLabel("單號", 3) });
    expect(tagOrder()).toEqual(["二星", "三星", "單號", "四星"]);
    expect(movedUp).toHaveFocus();
  });

  it("retains pointer drag reordering, suppresses its follow-on click, and focuses the moved tag", async () => {
    openNotebookSettings();
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".tag-setting-card"));
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => cards[2]),
    });
    const first = screen.getByRole("button", { name: reorderLabel("單號", 1) });
    first.focus();

    fireEvent.pointerDown(first, { pointerId: 7, clientX: 1, clientY: 1 });
    fireEvent.pointerMove(first, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(first, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.click(first);

    expect(screen.getByRole("dialog", { name: "確認變更玩法順序？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "確認變更" }));
    await waitFor(() => expect(tagOrder()).toEqual(["二星", "三星", "單號", "四星"]));
    expect(await screen.findByRole("button", { name: reorderLabel("單號", 3) })).toHaveFocus();
  });

  it("does not reinterpret a drag back to its origin or a cancelled drag as a click reorder", () => {
    openNotebookSettings();
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".tag-setting-card"));
    const elementFromPoint = vi.fn()
      .mockReturnValueOnce(cards[2])
      .mockReturnValue(cards[0]);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });
    const first = screen.getByRole("button", { name: reorderLabel("單號", 1) });

    fireEvent.pointerDown(first, { pointerId: 8, clientX: 1, clientY: 1 });
    fireEvent.pointerMove(first, { pointerId: 8, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(first, { pointerId: 8, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(first, { pointerId: 8, clientX: 1, clientY: 1 });
    fireEvent.click(first);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tagOrder()).toEqual(["單號", "二星", "三星", "四星"]);

    fireEvent.pointerDown(first, { pointerId: 9, clientX: 1, clientY: 1 });
    fireEvent.pointerMove(first, { pointerId: 9, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(first, { pointerId: 9, clientX: 10, clientY: 10 });
    fireEvent.click(first);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tagOrder()).toEqual(["單號", "二星", "三星", "四星"]);
  });

  it("keeps a custom tag name input mounted and focused across consecutive edits", async () => {
    openNotebookSettings();
    fireEvent.change(screen.getByPlaceholderText("新增自訂玩法"), { target: { value: "測" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "新增" }));

    const nameInput = await screen.findByRole("textbox", { name: "玩法名稱" });
    nameInput.focus();
    fireEvent.change(nameInput, { target: { value: "測試" } });
    expect(screen.getByRole("textbox", { name: "玩法名稱" })).toBe(nameInput);
    expect(nameInput).toHaveFocus();

    fireEvent.change(nameInput, { target: { value: "測試玩法" } });
    expect(screen.getByRole("textbox", { name: "玩法名稱" })).toBe(nameInput);
    expect(nameInput).toHaveFocus();
  });
});
