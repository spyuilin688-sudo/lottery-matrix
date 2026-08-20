// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  hasConfig: vi.fn(),
  getClient: vi.fn(),
}));

const adminApi = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(),
  fetchMembers: vi.fn(),
  fetchTransfers: vi.fn(),
  fetchPayments: vi.fn(),
  fetchActivationCodes: vi.fn(),
  generateActivationCodes: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  hasSupabaseConfig: supabase.hasConfig,
  getSupabaseClient: supabase.getClient,
}));

vi.mock("../../Prototype", () => ({ default: () => <div>member-root</div> }));

vi.mock("../api", () => ({
  fetchDashboardStats: adminApi.fetchDashboardStats,
  fetchMembers: adminApi.fetchMembers,
  fetchTransfers: adminApi.fetchTransfers,
  fetchPayments: adminApi.fetchPayments,
  fetchActivationCodes: adminApi.fetchActivationCodes,
  generateActivationCodes: adminApi.generateActivationCodes,
}));

import AdminApp from "../AdminApp";
import type { Session } from "@supabase/supabase-js";
import type { ActivationCodeRecord, ActivationCodeView, MemberView, PaymentView, TransferView } from "../types";

type AuthListener = (_event: string, session: Session | null) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function createClient({
  session = null,
  isAdmin = false,
  signOut = Promise.resolve({ error: null }),
  getSession,
}: {
  session?: Session | null;
  isAdmin?: boolean;
  signOut?: Promise<{ error: null }>;
  getSession?: Promise<{ data: { session: Session | null } }>;
} = {}) {
  let listener: AuthListener | undefined;
  const unsubscribe = vi.fn();

  return {
    auth: {
      getSession: vi.fn(() => getSession ?? Promise.resolve({ data: { session } })),
      onAuthStateChange: vi.fn((callback: AuthListener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
      signOut: vi.fn(() => signOut),
    },
    rpc: vi.fn(() => Promise.resolve({ data: isAdmin, error: null })),
    emitAuthState: (event: string, nextSession: Session | null) => listener?.(event, nextSession),
    unsubscribe,
  };
}

const adminSession = { user: { id: "admin-user" } } as Session;

const memberRecord: MemberView = {
  id: "member-1",
  auth_user_id: "auth-member-1",
  line_user_id: "line-member-1",
  registered_at: "2026-08-14T00:00:00.000Z",
  current_plan_id: "plan-month",
  plan_started_at: "2026-08-14T00:00:00.000Z",
  plan_expires_at: "2026-09-13T00:00:00.000Z",
  is_lifetime: false,
  status: "active",
  referral_code: "REFERRAL1",
  invitation_code: "INVITATION1",
  current_plan: { name: "月費方案" },
};

const transferRecord: TransferView = {
  id: "transfer-1",
  member_id: memberRecord.id,
  plan_id: memberRecord.current_plan_id!,
  amount: 1880,
  transferred_at: "2026-08-14T01:00:00.000Z",
  account_last_five: "12345",
  submitted_at: "2026-08-14T01:01:00.000Z",
  status: "pending",
  member: { id: memberRecord.id, line_user_id: memberRecord.line_user_id },
  plan: { name: "月費方案" },
};

const paymentRecord: PaymentView = {
  id: "payment-1",
  member_id: memberRecord.id,
  plan_id: memberRecord.current_plan_id!,
  amount: 4580,
  paid_at: "2026-08-14T02:00:00.000Z",
  status: "confirmed",
  member: { id: memberRecord.id, line_user_id: memberRecord.line_user_id },
  plan: { name: "季費方案" },
};

const activationCodeRecords: ActivationCodeRecord[] = Array.from({ length: 10 }, (_, index) => ({
  id: `activation-code-${index + 1}`,
  batch_id: "activation-batch-1",
  code: `A000-0000-0000-${String(index + 1).padStart(4, "0")}`,
  duration_type: "30_days",
  created_at: "2026-08-14T03:00:00.000Z",
  expires_at: "2026-09-14T03:00:00.000Z",
  redeemed_by_member_id: null,
  redeemed_at: null,
  status: "unused",
}));

afterEach(cleanup);

beforeEach(() => {
  supabase.hasConfig.mockReset();
  supabase.getClient.mockReset();
  supabase.hasConfig.mockReturnValue(true);
  supabase.getClient.mockReturnValue(createClient());
  adminApi.fetchDashboardStats.mockReset();
  adminApi.fetchMembers.mockReset();
  adminApi.fetchTransfers.mockReset();
  adminApi.fetchPayments.mockReset();
  adminApi.fetchActivationCodes.mockReset();
  adminApi.generateActivationCodes.mockReset();
  adminApi.fetchDashboardStats.mockResolvedValue({
    total_members: 12345,
    today_members: 67,
    paid_members: 8901,
    active_members: 2345,
    expired_members: 678,
    today_confirmed_amount: 1880,
    month_confirmed_amount: 4580,
    lifetime_confirmed_amount: 16800,
  });
  adminApi.fetchMembers.mockResolvedValue([]);
  adminApi.fetchTransfers.mockResolvedValue([]);
  adminApi.fetchPayments.mockResolvedValue([]);
  adminApi.fetchActivationCodes.mockResolvedValue([]);
  adminApi.generateActivationCodes.mockResolvedValue(activationCodeRecords);
});

describe("App route boundary", () => {
  it("renders admin only for /admin", async () => {
    window.history.replaceState({}, "", "/admin");
    const { default: App } = await import("../../App");

    render(<App />);

    expect(await screen.findByTestId("login")).toBeInTheDocument();
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
  });

  it("renders admin for nested /admin paths", async () => {
    window.history.replaceState({}, "", "/admin/members");
    const { default: App } = await import("../../App");

    render(<App />);

    expect(await screen.findByTestId("login")).toBeInTheDocument();
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-app-viewport")).not.toBeInTheDocument();
  });

  it("keeps a non-admin path in the production member shell", async () => {
    window.history.replaceState({}, "", "/matrix-explore");
    const { default: App } = await import("../../App");

    render(<App />);

    expect(screen.getByText("member-root")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-app-viewport")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login")).not.toBeInTheDocument();
  });
});

describe("AdminApp authorization boundary", () => {
  it.each([
    ["missing-config", "config-missing"],
    ["no-session", "login"],
    ["admin-session", "admin-layout"],
  ])("renders %s state", async (name, expectedTestId) => {
    if (name === "missing-config") {
      supabase.hasConfig.mockReturnValue(false);
    }

    if (name === "admin-session") {
      supabase.getClient.mockReturnValue(createClient({ session: adminSession, isAdmin: true }));
    }

    render(<AdminApp />);

    expect(await screen.findByTestId(expectedTestId)).toBeInTheDocument();
  });

  it("renders forbidden while signing out a session without administrator permission", async () => {
    const signingOut = deferred<{ error: null }>();
    const client = createClient({ session: adminSession, isAdmin: false, signOut: signingOut.promise });
    supabase.getClient.mockReturnValue(client);

    render(<AdminApp />);

    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);

    signingOut.resolve({ error: null });

    expect(await screen.findByTestId("login")).toBeInTheDocument();
  });

  it("unsubscribes from auth state changes when unmounted", () => {
    const client = createClient();
    supabase.getClient.mockReturnValue(client);

    const { unmount } = render(<AdminApp />);
    unmount();

    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("ignores an older getSession result after a newer auth state event", async () => {
    const initialSession = deferred<{ data: { session: Session | null } }>();
    const client = createClient({ getSession: initialSession.promise });
    supabase.getClient.mockReturnValue(client);

    render(<AdminApp />);
    client.emitAuthState("SIGNED_IN", null);
    initialSession.resolve({ data: { session: adminSession } });

    expect(await screen.findByTestId("login")).toBeInTheDocument();
    await waitFor(() => expect(client.rpc).not.toHaveBeenCalled());
  });

  it("renders the eight database statistics and signs out", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);

    render(<AdminApp />);

    await screen.findByTestId("admin-dashboard");

    for (const label of [
      "總註冊人數",
      "今日註冊人數",
      "付費會員人數",
      "有效會員人數",
      "已到期會員人數",
      "今日確認收款",
      "本月確認收款",
      "累計確認收款",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    for (const value of ["12,345", "67", "8,901", "2,345", "678", "1,880", "4,580", "16,800"]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }

    screen.getByRole("button", { name: "登出" }).click();

    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("renders every confirmed member record field", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);
    adminApi.fetchMembers.mockResolvedValue([memberRecord]);
    adminApi.fetchPayments.mockResolvedValue([paymentRecord]);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    screen.getByRole("button", { name: "會員管理" }).click();

    expect(await screen.findByTestId("admin-members")).toHaveAttribute("data-state", "ready");

    for (const label of [
      "會員編號",
      "LINE 識別資料",
      "註冊日期",
      "目前方案",
      "方案開始日期",
      "方案到期日期",
      "會員狀態",
      "付款紀錄",
      "推薦碼",
      "邀請碼",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    for (const value of [
      memberRecord.id,
      memberRecord.line_user_id!,
      memberRecord.registered_at,
      memberRecord.current_plan!.name,
      memberRecord.plan_started_at!,
      memberRecord.plan_expires_at!,
      memberRecord.status!,
      "1",
      memberRecord.referral_code!,
      memberRecord.invitation_code!,
    ]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(memberRecord.current_plan_id!)).not.toBeInTheDocument();
  });

  it("renders the confirmed transfer review fields with inactive review buttons", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);
    adminApi.fetchTransfers.mockResolvedValue([transferRecord]);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    screen.getByRole("button", { name: "轉帳審核" }).click();

    expect(await screen.findByTestId("admin-transfers")).toHaveAttribute("data-state", "ready");

    for (const label of ["會員", "付款方案", "轉帳金額", "轉帳時間", "帳號末五碼", "申請時間", "付款狀態"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    for (const value of [
      transferRecord.member.line_user_id!,
      transferRecord.plan.name,
      "1,880",
      transferRecord.transferred_at,
      transferRecord.account_last_five,
      transferRecord.submitted_at,
      "待確認",
    ]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }

    for (const button of screen.getAllByRole("button", { name: "確認收款" })) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: "退回" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.queryByText(transferRecord.member_id)).not.toBeInTheDocument();
    expect(screen.queryByText(transferRecord.plan_id)).not.toBeInTheDocument();
    expect(screen.queryByText(transferRecord.status)).not.toBeInTheDocument();
  });

  it("renders every confirmed payment record field", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);
    adminApi.fetchPayments.mockResolvedValue([paymentRecord]);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    screen.getByRole("button", { name: "付款紀錄" }).click();

    expect(await screen.findByTestId("admin-payments")).toHaveAttribute("data-state", "ready");

    for (const label of ["訂單編號", "會員", "方案", "金額", "付款時間", "付款狀態"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    for (const value of [
      paymentRecord.id,
      paymentRecord.member.line_user_id!,
      paymentRecord.plan.name,
      "4,580",
      paymentRecord.paid_at!,
      "已確認",
    ]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(paymentRecord.member_id)).not.toBeInTheDocument();
    expect(screen.queryByText(paymentRecord.plan_id)).not.toBeInTheDocument();
    expect(screen.queryByText(paymentRecord.status)).not.toBeInTheDocument();
  });

  it("renders all payment statuses with the confirmed Chinese labels", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);
    adminApi.fetchPayments.mockResolvedValue([
      { ...paymentRecord, id: "payment-pending", status: "pending" },
      paymentRecord,
      { ...paymentRecord, id: "payment-rejected", status: "rejected" },
    ]);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    screen.getByRole("button", { name: "付款紀錄" }).click();

    for (const label of ["待確認", "已確認", "已退回"]) {
      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
    }
    for (const rawStatus of ["pending", "confirmed", "rejected"]) {
      expect(screen.queryByText(rawStatus)).not.toBeInTheDocument();
    }
  });

  it.each([
    ["會員管理", "admin-members", "fetchMembers"],
    ["轉帳審核", "admin-transfers", "fetchTransfers"],
    ["付款紀錄", "admin-payments", "fetchPayments"],
  ] as const)("renders %s with an empty data state and no fake records", async (label, testId, _fetchName) => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    screen.getByRole("button", { name: label }).click();

    expect(await screen.findByTestId(testId)).toHaveAttribute("data-state", "empty");
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
  });

  it.each([
    ["7天", "7_days"],
    ["15天", "15_days"],
    ["月", "30_days"],
    ["季", "90_days"],
    ["年", "365_days"],
    ["終生", "lifetime"],
  ] as const)("generates exactly ten codes for %s", async (label, duration) => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    fireEvent.click(screen.getByRole("button", { name: "啟動碼管理" }));
    expect(await screen.findByTestId("admin-activation-codes")).toHaveAttribute("data-state", "empty");

    fireEvent.click(screen.getByRole("radio", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: "產生啟動碼" }));

    await waitFor(() => expect(adminApi.generateActivationCodes).toHaveBeenCalledWith(duration));
    expect(adminApi.generateActivationCodes).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("admin-activation-codes")).toHaveAttribute("data-state", "ready");
    for (const record of activationCodeRecords) {
      expect(screen.getAllByText(record.code).length).toBeGreaterThan(0);
    }

    expect(screen.getByText("固定產生數量：10")).toBeInTheDocument();
    for (const field of ["啟動碼", "方案期限", "產生時間", "啟動碼到期時間", "使用狀態", "兌換會員", "兌換時間"]) {
      expect(screen.getAllByText(field).length).toBeGreaterThan(0);
    }
    expect(screen.queryByLabelText(/金額|折抵|數量/)).not.toBeInTheDocument();
  });

  it("renders a redeemed member from the existing member relationship", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    supabase.getClient.mockReturnValue(client);
    const redeemedRecord: ActivationCodeView = {
      ...activationCodeRecords[0],
      status: "used",
      redeemed_by_member_id: memberRecord.id,
      redeemed_at: "2026-08-16T03:00:00.000Z",
      redeemed_member: { id: memberRecord.id, line_user_id: memberRecord.line_user_id },
    };
    adminApi.fetchActivationCodes.mockResolvedValue([redeemedRecord]);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    fireEvent.click(screen.getByRole("button", { name: "啟動碼管理" }));

    expect(await screen.findByTestId("admin-activation-codes")).toHaveAttribute("data-state", "ready");
    expect(screen.getAllByText("月").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已使用").length).toBeGreaterThan(0);
    expect(screen.getAllByText(memberRecord.line_user_id!).length).toBeGreaterThan(0);
    expect(screen.getAllByText(redeemedRecord.redeemed_at!).length).toBeGreaterThan(0);
  });

  it("keeps newly generated records when the initial fetch resolves later", async () => {
    const client = createClient({ session: adminSession, isAdmin: true });
    const initialFetch = deferred<ActivationCodeView[]>();
    supabase.getClient.mockReturnValue(client);
    adminApi.fetchActivationCodes.mockReturnValue(initialFetch.promise);

    render(<AdminApp />);
    await screen.findByTestId("admin-dashboard");
    fireEvent.click(screen.getByRole("button", { name: "啟動碼管理" }));
    await screen.findByTestId("admin-activation-codes");

    fireEvent.click(screen.getByRole("button", { name: "產生啟動碼" }));
    await waitFor(() => expect(adminApi.generateActivationCodes).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText(activationCodeRecords[0].code)).length).toBeGreaterThan(0);

    initialFetch.resolve([]);
    await waitFor(() => expect(screen.getAllByText(activationCodeRecords[0].code).length).toBeGreaterThan(0));
    expect(screen.getByTestId("admin-activation-codes")).toHaveAttribute("data-state", "ready");
  });
});
