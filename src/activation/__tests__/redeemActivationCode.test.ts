import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  getClient: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  getSupabaseClient: supabase.getClient,
}));

import { redeemActivationCode } from "../redeemActivationCode";

const redemption = {
  member_id: "member-1",
  duration_type: "30_days" as const,
  is_lifetime: false,
  plan_expires_at: "2026-09-13T00:00:00.000Z",
  redeemed_at: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  supabase.getClient.mockReset();
});

describe("redeemActivationCode", () => {
  it("normalizes and submits the existing activation code", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: redemption, error: null }));
    supabase.getClient.mockReturnValue({ rpc });

    await expect(redeemActivationCode("  a7k9-p2xm-4q8r-n6ty  ")).resolves.toEqual(redemption);
    expect(rpc).toHaveBeenCalledWith("redeem_activation_code", {
      p_code: "A7K9-P2XM-4Q8R-N6TY",
    });
  });

  it("rejects an empty activation code without calling Supabase", async () => {
    const rpc = vi.fn();
    supabase.getClient.mockReturnValue({ rpc });

    await expect(redeemActivationCode("   ")).rejects.toMatchObject({
      code: "INVALID_ACTIVATION_CODE_FORMAT",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a Supabase failure to a stable redemption error code", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: new Error("NETWORK_ERROR") }));
    supabase.getClient.mockReturnValue({ rpc });

    await expect(redeemActivationCode("A7K9-P2XM-4Q8R-N6TY")).rejects.toMatchObject({
      code: "ACTIVATION_CODE_REDEMPTION_FAILED",
    });
  });

  it("maps a rejected RPC promise to the same stable redemption error code", async () => {
    const rpc = vi.fn(() => Promise.reject(new Error("NETWORK_ERROR")));
    supabase.getClient.mockReturnValue({ rpc });

    await expect(redeemActivationCode("A7K9-P2XM-4Q8R-N6TY")).rejects.toMatchObject({
      code: "ACTIVATION_CODE_REDEMPTION_FAILED",
    });
  });
});
