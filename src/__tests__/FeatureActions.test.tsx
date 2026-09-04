// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const matrixCards = vi.hoisted(() => ({
  fetchMatrixCardManifest: vi.fn(),
  matrixCardUrl: vi.fn((path: string) => `https://matrix.example.test${path}`),
}));
const matrixTicket = vi.hoisted(() => ({ download: vi.fn() }));
const activation = vi.hoisted(() => ({ redeem: vi.fn() }));
const memberReferral = vi.hoisted(() => ({ fetchSummary: vi.fn(), submit: vi.fn() }));

vi.mock("../lottery-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lottery-api")>()),
  fetchMatrixCardManifest: matrixCards.fetchMatrixCardManifest,
  matrixCardUrl: matrixCards.matrixCardUrl,
}));

vi.mock("../matrix-ticket-download", () => ({
  downloadMatrixCardPng: matrixTicket.download,
}));

vi.mock("../activation/redeemActivationCode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../activation/redeemActivationCode")>()),
  redeemActivationCode: activation.redeem,
}));

vi.mock("../member-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../member-api")>()),
  fetchMemberReferralSummary: memberReferral.fetchSummary,
  submitMemberReferralCode: memberReferral.submit,
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
  matrixTicket.download.mockReset().mockResolvedValue(undefined);
  activation.redeem.mockReset().mockResolvedValue({
    member_id: "member-1",
    duration_type: "30_days",
    is_lifetime: false,
    plan_expires_at: "2026-10-02T00:00:00Z",
    redeemed_at: "2026-09-02T00:00:00Z",
  });
  memberReferral.fetchSummary.mockReset().mockResolvedValue({
    referralCode: "MATRIX-7H4K9P",
    referralSuccessCount: 3,
    hasInvitationCode: false,
    canSubmitReferralCode: true,
  });
  memberReferral.submit.mockReset().mockResolvedValue({
    referralCode: "MATRIX-7H4K9P",
    referralSuccessCount: 3,
    hasInvitationCode: true,
    canSubmitReferralCode: false,
  });
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
  it("does not start the Matrix ticket download after cancelling confirmation", async () => {
    render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
    const button = await screen.findByRole("button", { name: "下載牌單" });
    fireEvent.click(button);
    expect(matrixTicket.download).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("確認下載牌單？");
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(matrixTicket.download).not.toHaveBeenCalled();
  });

  it("downloads the current Matrix ticket once, exposes pending failure, and permits retry", async () => {
    let rejectDownload!: (reason: Error) => void;
    matrixTicket.download
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectDownload = reject; }))
      .mockResolvedValueOnce(undefined);
    render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);

    const button = await screen.findByRole("button", { name: "下載牌單" });
    await screen.findByRole("img", { name: "今彩539順球牌單，第 115000001 期" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "確認" }));

    await waitFor(() => expect(matrixTicket.download).toHaveBeenCalledWith(
      "https://matrix.example.test/api/matrix/cards/今彩539/sorted.svg",
      "今彩539-順球牌單.png",
    ));
    expect(matrixTicket.download).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(matrixTicket.download).toHaveBeenCalledTimes(1);

    await act(async () => { rejectDownload(new Error("private renderer detail")); });
    expect(screen.getByRole("alert")).toHaveTextContent("下載失敗，請稍後再試");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-busy", "false");

    fireEvent.click(button);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "確認" }));
    await waitFor(() => expect(matrixTicket.download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads referral details and lets an eligible member submit one referral code", async () => {
    const onNavigate = vi.fn();
    render(<AppDialogProvider><FeaturePageRouter screen="activation-code" onNavigate={onNavigate} /></AppDialogProvider>);

    expect(await screen.findByText("MATRIX-7H4K9P")).toBeInTheDocument();
    expect(document.querySelector(".referral-success-count")).toHaveTextContent("推薦成功 3 人");

    expect(screen.queryByRole("button", { name: "邀請好友" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製推薦碼" })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    const referralCard = screen.getByRole("heading", { name: "輸入推薦碼" }).closest("section");
    expect(referralCard).not.toBeNull();
    const referralConfirm = within(referralCard!).getByRole("button", { name: "確認" });
    const referralInput = within(referralCard!).getByRole("textbox", { name: "推薦碼" });
    expect(referralConfirm).toBeDisabled();
    expect(referralConfirm).toHaveClass("primary-action", "branded-explore-action");

    fireEvent.change(referralInput, { target: { value: "FRIEND-8A2K" } });
    expect(referralConfirm).toBeEnabled();
    fireEvent.click(referralConfirm);
    const referralDialog = await screen.findByRole("dialog");
    expect(referralDialog).toHaveTextContent("確認輸入推薦碼？");
    fireEvent.click(within(referralDialog).getByRole("button", { name: "確認" }));

    expect(await screen.findByRole("status")).toHaveTextContent("推薦碼已儲存");
    expect(referralInput).toHaveValue("");
    expect(referralConfirm).toBeDisabled();

    render(<NotesPage onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "紀錄設定" })).toBeDisabled();
  });

  it("places the three support contacts together on the contact page", () => {
    render(<FeaturePageRouter screen="merchant-info" onNavigate={vi.fn()} />);

    const contactCards = Array.from(document.querySelectorAll(".contact-support-screen .detail-card"));
    expect(contactCards.map((card) => card.querySelector("h2")?.textContent)).toEqual([
      "聯絡客服",
      "問題回報",
      "商務合作",
    ]);
    expect(screen.getAllByRole("link", { name: "Matrix1150801@gmail.com" })).toHaveLength(3);
  });

  it("combines version information and update history into one page", () => {
    render(<FeaturePageRouter screen="version-info" onNavigate={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "版本資訊/更新紀錄" })).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
  });

  it("keeps the activation-code input collapsed until the user opens it", () => {
    render(<AppDialogProvider><FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} /></AppDialogProvider>);

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

  it("keeps activation-code redemption available after referral-code eligibility ends", async () => {
    memberReferral.fetchSummary.mockResolvedValueOnce({
      referralCode: "MATRIX-7H4K9P",
      referralSuccessCount: 3,
      hasInvitationCode: true,
      canSubmitReferralCode: false,
    });
    render(<AppDialogProvider><FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} /></AppDialogProvider>);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "推薦碼" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "啟動碼" }));

    expect(screen.getByRole("textbox", { name: "啟動碼" })).toBeEnabled();
    expect(within(document.getElementById("activation-code-panel")!).getByRole("button", { name: "確認" })).toBeEnabled();
  });

  it("shows a safe activation success and clears the redeemed code", async () => {
    render(<AppDialogProvider><FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} /></AppDialogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "啟動碼" }));
    const input = screen.getByRole("textbox", { name: "啟動碼" });
    fireEvent.change(input, { target: { value: "A7K9-P2XM-4Q8R-N6TY" } });
    fireEvent.click(within(document.getElementById("activation-code-panel")!).getByRole("button", { name: "確認" }));
    const successDialog = await screen.findByRole("dialog");
    expect(successDialog).toHaveTextContent("確認使用啟動碼？");
    fireEvent.click(within(successDialog).getByRole("button", { name: "確認" }));

    expect(await screen.findByRole("status")).toHaveTextContent("啟動成功");
    expect(input).toHaveValue("");
  });

  it("shows an already-used message without exposing or clearing the failed code", async () => {
    activation.redeem.mockRejectedValueOnce(Object.assign(new Error("hidden database detail"), {
      code: "ACTIVATION_CODE_ALREADY_USED",
    }));
    render(<AppDialogProvider><FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} /></AppDialogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "啟動碼" }));
    const input = screen.getByRole("textbox", { name: "啟動碼" });
    fireEvent.change(input, { target: { value: "A7K9-P2XM-4Q8R-N6TY" } });
    fireEvent.click(within(document.getElementById("activation-code-panel")!).getByRole("button", { name: "確認" }));
    const failureDialog = await screen.findByRole("dialog");
    fireEvent.click(within(failureDialog).getByRole("button", { name: "確認" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("啟動碼已使用");
    expect(alert).not.toHaveTextContent("hidden database detail");
    expect(input).toHaveValue("A7K9-P2XM-4Q8R-N6TY");

    fireEvent.change(input, { target: { value: "B7K9-P2XM-4Q8R-N6TY" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
