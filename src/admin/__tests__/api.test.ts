import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  getClient: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  getSupabaseClient: supabase.getClient,
}));

import {
  fetchActivationCodes,
  fetchDashboardStats,
  fetchMembers,
  fetchMatrixCustomStatuses,
  fetchPayments,
  fetchTransfers,
  generateActivationCodes,
} from "../api";
import type {
  ActivationCodeRecord,
  DashboardStats,
  MemberView,
  PaymentView,
  TransferView,
  MatrixCustomStatusView,
} from "../types";

type QueryResult<T> = { data: T; error: Error | null };

function orderedQuery<T>(result: QueryResult<T>) {
  const order = vi.fn(() => Promise.resolve(result));
  const select = vi.fn(() => ({ order }));

  return { select, order };
}

const stats: DashboardStats = {
  total_members: 4,
  today_members: 1,
  paid_members: 3,
  active_members: 2,
  expired_members: 1,
  today_confirmed_amount: 1880,
  month_confirmed_amount: 4580,
  lifetime_confirmed_amount: 6460,
};

const member: MemberView = {
  id: "1ef09e0d-e603-430d-83e5-cd3a3d0e9fc4",
  auth_user_id: "9e19d08f-6a1a-4ae3-bda4-1a05946f423b",
  line_user_id: null,
  registered_at: "2026-08-14T00:00:00.000Z",
  current_plan_id: null,
  plan_started_at: null,
  plan_expires_at: "2026-09-13T00:00:00.000Z",
  is_lifetime: false,
  status: null,
  referral_code: null,
  invitation_code: null,
  current_plan: { name: "月費方案" },
};

const transfer: TransferView = {
  id: "7f211ca9-f8a4-4a18-86d3-b84494beeff3",
  member_id: member.id,
  plan_id: "d419b7a3-4a94-4baa-9103-e189b7d8eaae",
  amount: 1880,
  transferred_at: "2026-08-14T01:00:00.000Z",
  account_last_five: "12345",
  submitted_at: "2026-08-14T01:01:00.000Z",
  status: "pending",
  member: { id: member.id, line_user_id: "line-member-1" },
  plan: { name: "月費方案" },
};

const payment: PaymentView = {
  id: "58a48392-36fe-4b48-a12f-e4ed00d5d25f",
  member_id: member.id,
  plan_id: transfer.plan_id,
  amount: 4580,
  paid_at: "2026-08-14T02:00:00.000Z",
  status: "confirmed",
  member: { id: member.id, line_user_id: "line-member-1" },
  plan: { name: "季費方案" },
};

const activationCode: ActivationCodeRecord = {
  id: "49a90a54-37de-4309-bc34-b571734c1bcc",
  batch_id: "0dc0a64d-29b5-4b4c-a8d2-7d2ad2b541c4",
  code: "A7K9-P2XM-4Q8R-N6TY",
  duration_type: "30_days",
  created_at: "2026-08-14T03:00:00.000Z",
  expires_at: "2026-09-14T03:00:00.000Z",
  redeemed_by_member_id: null,
  redeemed_at: null,
  status: "unused",
};

const matrixStatus: MatrixCustomStatusView = {
  member_id: member.id,
  lottery: "今彩539",
  status: "ACTIVE",
  config: { oneCodeGroups: [], twoCodeGroups: [] },
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T01:00:00.000Z",
  member: { id: member.id, line_user_id: "line-member-1" },
};

beforeEach(() => {
  supabase.getClient.mockReset();
});

describe("admin data API", () => {
  it("returns the dashboard statistics RPC result", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: stats, error: null }));
    supabase.getClient.mockReturnValue({ rpc });

    await expect(fetchDashboardStats()).resolves.toEqual(stats);
    expect(rpc).toHaveBeenCalledWith("admin_dashboard_stats");
  });

  it.each([
    ["members", "registered_at", [member], fetchMembers],
    ["transfer requests", "submitted_at", [transfer], fetchTransfers],
    ["payments", "paid_at", [payment], fetchPayments],
    ["activation codes", "created_at", [activationCode], fetchActivationCodes],
    ["matrix custom status configs", "updated_at", [matrixStatus], fetchMatrixCustomStatuses],
  ] as const)("returns %s ordered by %s descending", async (table, column, records, fetchRecords) => {
    const query = orderedQuery({ data: records, error: null });
    const from = vi.fn(() => query);
    supabase.getClient.mockReturnValue({ from });

    await expect(fetchRecords()).resolves.toEqual(records);
    expect(from).toHaveBeenCalledWith(table === "transfer requests" ? "transfer_requests" : table.replaceAll(" ", "_"));
    const expectedSelect = {
      members: "*, current_plan:plans!members_current_plan_id_fkey(name)",
      "transfer requests":
        "*, member:members!transfer_requests_member_id_fkey(id,line_user_id), plan:plans!transfer_requests_plan_id_fkey(name)",
      payments:
        "*, member:members!payments_member_id_fkey(id,line_user_id), plan:plans!payments_plan_id_fkey(name)",
      "activation codes": "*, redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,line_user_id)",
      "matrix custom status configs": "*, member:members!matrix_custom_status_configs_member_id_fkey(id,line_user_id)",
    }[table];
    expect(query.select).toHaveBeenCalledWith(expectedSelect);
    expect(query.order).toHaveBeenCalledWith(column, { ascending: false });
  });

  it("requests ten server-generated 30-day activation codes", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: [activationCode], error: null }));
    supabase.getClient.mockReturnValue({ rpc });

    await expect(generateActivationCodes("30_days")).resolves.toEqual([activationCode]);
    expect(rpc).toHaveBeenCalledWith("generate_activation_code_batch", {
      p_duration_type: "30_days",
    });
  });

  it.each([
    ["dashboard statistics", fetchDashboardStats, "rpc"],
    ["members", fetchMembers, "query"],
    ["transfer requests", fetchTransfers, "query"],
    ["payments", fetchPayments, "query"],
    ["activation codes", fetchActivationCodes, "query"],
    ["matrix custom status configs", fetchMatrixCustomStatuses, "query"],
    ["activation-code generation", () => generateActivationCodes("7_days"), "rpc"],
  ] as const)("throws the Supabase error for %s", async (_name, request, source) => {
    const supabaseError = new Error("SUPABASE_UNAVAILABLE");

    if (source === "rpc") {
      supabase.getClient.mockReturnValue({
        rpc: vi.fn(() => Promise.resolve({ data: null, error: supabaseError })),
      });
    } else {
      const query = orderedQuery({ data: null, error: supabaseError });
      supabase.getClient.mockReturnValue({ from: vi.fn(() => query) });
    }

    await expect(request()).rejects.toBe(supabaseError);
  });
});
