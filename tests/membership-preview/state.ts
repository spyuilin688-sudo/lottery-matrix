// Explicit test data only; no real tokens, storage, provider calls or payment mutations.
const scenario = new URLSearchParams(location.search).get("state") ?? "year";
const signedIn = scenario !== "anonymous";
let session: unknown = signedIn ? {
  access_token: "qa-only-not-a-token",
  user: { id: "qa-user", user_metadata: {
    name: scenario === "long" ? "這是一個很長的 LINE 會員暱稱與英文 LongDisplayName" : "Yu YiXang🐳",
    picture: "/assets/lottery/matrix-profile-avatar.jpg",
  } },
} : null;
const listeners = new Set<(event: string, value: unknown) => void>();
let retries = 0;
const client = {
  auth: {
    async getSession() {
      if (scenario === "loading") return new Promise<never>(() => {});
      if (scenario === "error" && retries++ === 0) return { data: { session: null }, error: new Error("QA_SESSION_UNAVAILABLE") };
      return { data: { session }, error: null };
    },
    onAuthStateChange(listener: (event: string, value: unknown) => void) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
  },
  async rpc(name: string) {
    if (name === "member_bootstrap") return { data: { memberId: "qa-member", lineUserId: "qa-line" }, error: null };
    if (name === "member_profile") {
      if (scenario === "profile-error") return { data: null, error: new Error("QA_PROFILE_UNAVAILABLE") };
      return { data: {
        lineUserId: "qa-line",
        planName: scenario === "free" ? "免費會員" : scenario === "lifetime" ? "終身方案" : "年費方案",
        planExpiresAt: scenario === "free" ? null : "2027-10-29T00:00:00.000Z",
        isLifetime: scenario === "lifetime",
      }, error: null };
    }
    throw new Error("QA_UNSUPPORTED_OPERATION");
  },
};
export const getSupabaseClient = () => client;
export const hasSupabaseConfig = () => true;
export const reconcilePendingLineLogoutPresence = () => undefined;
export async function signOutFromMatrix() {
  if (scenario === "logout-error") throw new Error("QA_LOGOUT_FAILED");
  session = null;
  listeners.forEach(listener => listener("SIGNED_OUT", null));
}
export async function signInWithLine() { throw new Error("此為本機預覽，未連接 LINE 登入。"); }
export function usePwaLifecycle() {
  return { showInstallAction: false, requestInstall: async () => "unavailable" };
}
export function usePermissionSettings() {
  return {
    subscriptionPurchaseVisible: true,
    registeredMemberFreeAccess: false,
    revision: 1,
    updatedAt: "2026-09-10T00:00:00.000Z",
  };
}
