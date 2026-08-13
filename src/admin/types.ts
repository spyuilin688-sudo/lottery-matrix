export type AdminSection = "dashboard" | "members" | "transfers" | "payments" | "activation-codes";

export type ActivationDuration = "7_days" | "15_days" | "30_days" | "90_days" | "365_days" | "lifetime";

export type DashboardStats = {
  total_members: number;
  today_members: number;
  paid_members: number;
  active_members: number;
  expired_members: number;
  today_confirmed_amount: number;
  month_confirmed_amount: number;
  lifetime_confirmed_amount: number;
};

export type MemberRecord = {
  id: string;
  auth_user_id: string;
  line_user_id: string | null;
  registered_at: string;
  current_plan_id: string | null;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  is_lifetime: boolean;
  status: string | null;
  referral_code: string | null;
  invitation_code: string | null;
};

export type MemberView = MemberRecord & {
  current_plan: { name: string } | null;
};

export type TransferRecord = {
  id: string;
  member_id: string;
  plan_id: string;
  amount: number;
  transferred_at: string;
  account_last_five: string;
  submitted_at: string;
  status: "pending" | "confirmed" | "rejected";
};

export type TransferView = TransferRecord & {
  member: { id: string; line_user_id: string | null };
  plan: { name: string };
};

export type PaymentRecord = {
  id: string;
  member_id: string;
  plan_id: string;
  amount: number;
  paid_at: string | null;
  status: "pending" | "confirmed" | "rejected";
};

export type PaymentView = PaymentRecord & {
  member: { id: string; line_user_id: string | null };
  plan: { name: string };
};

export type ActivationCodeRecord = {
  id: string;
  batch_id: string;
  code: string;
  duration_type: ActivationDuration;
  created_at: string;
  expires_at: string;
  redeemed_by_member_id: string | null;
  redeemed_at: string | null;
  status: "unused" | "used" | "expired";
};

export type ActivationCodeView = ActivationCodeRecord & {
  redeemed_member: { id: string; line_user_id: string | null } | null;
};
