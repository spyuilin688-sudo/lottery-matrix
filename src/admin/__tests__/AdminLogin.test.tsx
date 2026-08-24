// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  getSupabaseClient: () => ({ auth }),
}));

import AdminLogin from "../AdminLogin";

const adminCss = readFileSync(`${process.cwd()}/src/admin/admin.css`, "utf8");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function fillCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("密碼"), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "登入" }));
}

afterEach(cleanup);

beforeEach(() => {
  auth.signInWithPassword.mockReset();
  auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: "admin-user" }, session: null },
    error: null,
  });
});

describe("AdminLogin", () => {
  it("owns blank-submit validation and focuses the first invalid field", () => {
    render(<AdminLogin />);

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("密碼");
    const form = screen.getByRole("button", { name: "登入" }).closest("form");

    expect(form).toHaveAttribute("novalidate");
    expect(email).toBeRequired();
    expect(password).toBeRequired();
    submit();

    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "admin-email-error");
    expect(screen.getByText("請輸入 Email")).toHaveAttribute("id", "admin-email-error");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", "admin-password-error");
    expect(screen.getByText("請輸入密碼")).toHaveAttribute("id", "admin-password-error");
    expect(email).toHaveAccessibleName("Email");
    expect(password).toHaveAccessibleName("密碼");
    expect(email).toHaveFocus();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects an invalid email and clears only that field error on edit", () => {
    render(<AdminLogin />);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("密碼");

    fillCredentials("not-an-email", "");
    submit();

    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "admin-email-error");
    expect(screen.getByText("Email 格式不正確")).toHaveAttribute("id", "admin-email-error");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", "admin-password-error");
    expect(screen.getByText("請輸入密碼")).toHaveAttribute("id", "admin-password-error");
    expect(email).toHaveFocus();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: "admin@example.com" } });

    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Email 格式不正確")).not.toBeInTheDocument();
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", "admin-password-error");
    expect(screen.getByText("請輸入密碼")).toBeInTheDocument();
  });

  it("requires a password, focuses it, and clears its error on edit", () => {
    render(<AdminLogin />);
    const password = screen.getByLabelText("密碼");

    fillCredentials("admin@example.com", "");
    submit();

    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", "admin-password-error");
    expect(screen.getByText("請輸入密碼")).toHaveAttribute("id", "admin-password-error");
    expect(password).toHaveFocus();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();

    fireEvent.change(password, { target: { value: "secret" } });

    expect(password).not.toHaveAttribute("aria-invalid");
    expect(password).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("請輸入密碼")).not.toBeInTheDocument();
  });

  it("shows a generic recoverable message when Supabase returns an auth error", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    render(<AdminLogin />);

    fillCredentials("admin@example.com", "secret");
    submit();

    const error = await screen.findByText("登入失敗，請確認 Email 與密碼後再試");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveAttribute("data-error-code", "AUTH_LOGIN_FAILED");
    expect(screen.getByLabelText("Email")).toHaveValue("admin@example.com");
    expect(screen.getByLabelText("密碼")).toHaveValue("secret");
    expect(screen.getByRole("button", { name: "登入" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    expect(screen.queryByText("登入失敗，請確認 Email 與密碼後再試")).not.toBeInTheDocument();
  });

  it("recovers with the same generic message when the Supabase request rejects", async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new Error("network unavailable"));
    render(<AdminLogin />);

    fillCredentials("admin@example.com", "secret");
    submit();

    expect(await screen.findByText("登入失敗，請確認 Email 與密碼後再試")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByRole("button", { name: "登入" })).toBeEnabled();
  });

  it.each([
    {
      field: "Email",
      nextValue: "owner@example.com",
      expectedEmail: "owner@example.com",
      expectedPassword: "secret",
    },
    {
      field: "密碼",
      nextValue: "new-secret",
      expectedEmail: "admin@example.com",
      expectedPassword: "new-secret",
    },
  ])("ignores an older rejected request after editing $field", async ({
    field,
    nextValue,
    expectedEmail,
    expectedPassword,
  }) => {
    const request = deferred<never>();
    auth.signInWithPassword.mockReturnValueOnce(request.promise);
    render(<AdminLogin />);

    fillCredentials("admin@example.com", "secret");
    submit();

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("密碼");
    const button = screen.getByRole("button", { name: "登入" });
    expect(email).toBeEnabled();
    expect(password).toBeEnabled();
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(field), { target: { value: nextValue } });
    request.reject(new Error("old request failed"));

    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText("登入失敗，請確認 Email 與密碼後再試")).not.toBeInTheDocument();
    expect(email).toHaveValue(expectedEmail);
    expect(password).toHaveValue(expectedPassword);
  });

  it("submits a trimmed email and unchanged password on success", async () => {
    render(<AdminLogin />);

    fillCredentials("\u00a0admin@example.com\u00a0", " secret ");
    submit();

    await waitFor(() => {
      expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: "admin@example.com",
        password: " secret ",
      });
    });
    expect(screen.queryByText("登入失敗，請確認 Email 與密碼後再試")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登入" })).toBeEnabled();
  });

  it("prevents duplicate requests and exposes a stable busy state", async () => {
    const request = deferred<{
      data: { user: { id: string }; session: null };
      error: null;
    }>();
    auth.signInWithPassword.mockReturnValueOnce(request.promise);
    render(<AdminLogin />);

    fillCredentials("admin@example.com", "secret");
    const button = screen.getByRole("button", { name: "登入" });
    const form = button.closest("form")!;

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();

    request.resolve({
      data: { user: { id: "admin-user" }, session: null },
      error: null,
    });

    await waitFor(() => {
      expect(form).toHaveAttribute("aria-busy", "false");
      expect(button).toBeEnabled();
    });
  });

  it("reserves distinct two-line geometry for form errors", () => {
    expect(adminCss).toContain(".admin-app .admin-login-field-error");
    const style = document.createElement("style");
    style.textContent = adminCss;
    document.head.append(style);
    render(<AdminLogin />);

    const fieldError = document.querySelector(".admin-login-field-error");
    const formError = document.querySelector(".admin-login-form-error");

    expect(fieldError).not.toBeNull();
    expect(formError).not.toBeNull();
    expect(getComputedStyle(fieldError!).minHeight).toBe("20px");
    expect(getComputedStyle(formError!).minHeight).toBe("40px");
    expect(getComputedStyle(formError!).lineHeight).toBe("20px");

    style.remove();
  });
});
