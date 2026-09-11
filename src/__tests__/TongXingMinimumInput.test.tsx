// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const lotteryApi = vi.hoisted(() => ({
  fetchTongXing: vi.fn(),
}));

const dialogApi = vi.hoisted(() => ({
  alert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lottery-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lottery-api")>()),
  fetchTongXing: lotteryApi.fetchTongXing,
}));

vi.mock("../dialog/AppDialog", () => ({
  useAppDialog: () => dialogApi,
}));

import { FeaturePageRouter } from "../FeaturePagesCore";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  lotteryApi.fetchTongXing.mockReset();
  dialogApi.alert.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("輸入不足兩碼時只顯示提示且不呼叫同星 API", async () => {
  render(<FeaturePageRouter screen="tongxing" onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "開始探索" }));

  await waitFor(() => expect(dialogApi.alert).toHaveBeenCalledWith({ title: "請至少輸入兩個號碼" }));
  expect(lotteryApi.fetchTongXing).not.toHaveBeenCalled();
  expect(screen.queryByText("探索結果")).not.toBeInTheDocument();
});
