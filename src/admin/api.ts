import { getSupabaseClient } from "../lib/supabase";
import type {
  ActivationCodeRecord,
  ActivationDuration,
  ActivationCodeView,
  DashboardStats,
  MemberView,
  PaymentView,
  TransferView,
} from "./types";

type AdminTable = "members" | "transfer_requests" | "payments" | "activation_codes";

async function fetchOrderedRecords<T>(table: AdminTable, selectColumns: string, column: string): Promise<T[]> {
  const { data, error } = await getSupabaseClient()
    .from(table)
    .select(selectColumns)
    .order(column, { ascending: false });

  if (error) throw error;

  return data as T[];
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await getSupabaseClient().rpc("admin_dashboard_stats");

  if (error) throw error;

  return data as DashboardStats;
}

export function fetchMembers(): Promise<MemberView[]> {
  return fetchOrderedRecords<MemberView>(
    "members",
    "*, current_plan:plans!members_current_plan_id_fkey(name)",
    "registered_at",
  );
}

export function fetchTransfers(): Promise<TransferView[]> {
  return fetchOrderedRecords<TransferView>(
    "transfer_requests",
    "*, member:members!transfer_requests_member_id_fkey(id,line_user_id), plan:plans!transfer_requests_plan_id_fkey(name)",
    "submitted_at",
  );
}

export function fetchPayments(): Promise<PaymentView[]> {
  return fetchOrderedRecords<PaymentView>(
    "payments",
    "*, member:members!payments_member_id_fkey(id,line_user_id), plan:plans!payments_plan_id_fkey(name)",
    "paid_at",
  );
}

export function fetchActivationCodes(): Promise<ActivationCodeView[]> {
  return fetchOrderedRecords<ActivationCodeView>(
    "activation_codes",
    "*, redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,line_user_id)",
    "created_at",
  );
}

export async function generateActivationCodes(duration: ActivationDuration): Promise<ActivationCodeRecord[]> {
  const { data, error } = await getSupabaseClient().rpc("generate_activation_code_batch", {
    p_duration_type: duration,
  });

  if (error) throw error;

  return data as ActivationCodeRecord[];
}
