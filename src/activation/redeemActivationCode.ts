import { getSupabaseClient } from "../lib/supabase";
import type { ActivationDuration } from "../admin/types";

export type ActivationRedemptionResult = {
  member_id: string;
  duration_type: ActivationDuration;
  is_lifetime: boolean;
  plan_expires_at: string | null;
  redeemed_at: string;
};

export type ActivationRedemptionErrorCode =
  | "INVALID_ACTIVATION_CODE_FORMAT"
  | "ACTIVATION_CODE_REDEMPTION_FAILED";

export type ActivationRedemptionError = Error & {
  code: ActivationRedemptionErrorCode;
};

const activationCodePattern = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;

function createRedemptionError(code: ActivationRedemptionErrorCode): ActivationRedemptionError {
  return Object.assign(new Error(code), { code });
}

export function isActivationRedemptionError(error: unknown): error is ActivationRedemptionError {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error.code === "INVALID_ACTIVATION_CODE_FORMAT" || error.code === "ACTIVATION_CODE_REDEMPTION_FAILED");
}

export async function redeemActivationCode(code: string): Promise<ActivationRedemptionResult> {
  const normalizedCode = code.trim().toUpperCase();

  if (!activationCodePattern.test(normalizedCode)) {
    throw createRedemptionError("INVALID_ACTIVATION_CODE_FORMAT");
  }

  try {
    const { data, error } = await getSupabaseClient().rpc("redeem_activation_code", {
      p_code: normalizedCode,
    });

    if (error) throw error;

    return data as ActivationRedemptionResult;
  } catch {
    throw createRedemptionError("ACTIVATION_CODE_REDEMPTION_FAILED");
  }
}
