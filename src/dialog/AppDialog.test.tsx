// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppDialogProvider, useAppDialog } from "./AppDialog";

afterEach(cleanup);

function ConfirmHarness() {
  const dialog = useAppDialog();
  const [result, setResult] = useState("尚未選擇");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const confirmed = await dialog.confirm({
            title: "確認刪除？",
            description: "刪除後將移除此項目。",
            confirmLabel: "刪除",
            tone: "danger",
          });
          setResult(confirmed ? "已確認" : "已取消");
        }}
      >
        開啟確認
      </button>
      <output>{result}</output>
    </>
  );
}

function LogoutHarness() {
  const dialog = useAppDialog();
  return <button type="button" onClick={() => void dialog.confirm({ title: "確認登出？", icon: "logout" })}>開啟登出確認</button>;
}

function QueuedHarness() {
  const { confirm } = useAppDialog();
  return <button type="button" onClick={() => {
    void confirm({ title: "第一個視窗" });
    void confirm({ title: "第二個視窗" });
  }}>開啟兩個視窗</button>;
}

describe("AppDialog", () => {
  it("以可存取的共用對話框取代原生 confirm，並回傳使用者選擇", async () => {
    render(
      <AppDialogProvider>
        <ConfirmHarness />
      </AppDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "開啟確認" }));
    expect(screen.getByRole("dialog", { name: "確認刪除？" })).toBeTruthy();
    expect(screen.getByText("刪除後將移除此項目。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(await screen.findByText("已取消")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "開啟確認" }));
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));
    expect(await screen.findByText("已確認")).toBeTruthy();
  });

  it("按 Escape 視為取消，並在關閉後恢復觸發按鈕焦點", async () => {
    render(
      <AppDialogProvider>
        <ConfirmHarness />
      </AppDialogProvider>,
    );

    const trigger = screen.getByRole("button", { name: "開啟確認" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(await screen.findByText("已取消")).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });

  it("支援登出確認稿使用的專用圖示", () => {
    render(<AppDialogProvider><LogoutHarness /></AppDialogProvider>);

    fireEvent.click(screen.getByRole("button", { name: "開啟登出確認" }));

    expect(screen.getByRole("dialog", { name: "確認登出？" }).querySelector('[data-dialog-icon="logout"]')).toBeTruthy();
  });

  it("StrictMode 下關閉目前視窗後仍會開啟佇列視窗且不重複", async () => {
    render(<StrictMode><AppDialogProvider><QueuedHarness /></AppDialogProvider></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: '開啟兩個視窗' }));
    expect(screen.getByRole('dialog', { name: '第一個視窗' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    expect(await screen.findByRole('dialog', { name: '第二個視窗' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
