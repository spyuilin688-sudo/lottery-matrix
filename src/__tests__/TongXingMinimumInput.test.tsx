// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const lotteryApi = vi.hoisted(() => ({
  fetchTongXing: vi.fn(),
}));

vi.mock("../lottery-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lottery-api")>()),
  fetchTongXing: lotteryApi.fetchTongXing,
}));

import { FeaturePageRouter } from "../FeaturePages";
import { AppDialogProvider } from "../dialog/AppDialog";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  lotteryApi.fetchTongXing.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("輸入不足兩碼時只顯示提示且不呼叫同星 API", async () => {
  render(
    <AppDialogProvider>
      <FeaturePageRouter screen="tongxing" onNavigate={vi.fn()} />
    </AppDialogProvider>,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "號碼 1" }), {
    target: { value: "01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "開始探索" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("請至少輸入兩個號碼");
  expect(lotteryApi.fetchTongXing).not.toHaveBeenCalled();
  expect(screen.queryByText("探索結果")).not.toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
});
