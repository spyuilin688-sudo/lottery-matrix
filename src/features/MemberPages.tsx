import { useId, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CheckIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import type { Session } from "@supabase/supabase-js";
import { isActivationRedemptionError, redeemActivationCode, type ActivationRedemptionErrorCode } from "../activation/redeemActivationCode";
import { bootstrapMember, fetchMemberProfile, fetchMemberReferralSummary, fetchPendingTransferRequest, submitMemberReferralCode, submitTransferRequest, type MemberProfileResponse, type MemberReferralSummary, type MemberTransferRequest, type ManualTransferPlanCode } from "../member-api";
import { clearManualTransferAttempt, readManualTransferAttempt, readManualTransferPlan, reserveManualTransferAttempt, saveManualTransferPlan } from "../manual-transfer-selection";
import { prepareLineLoginUrl, reconcilePendingLineLogoutPresence, shouldUseDirectLineBrowserLink, signInWithLine, signOutFromMatrix } from "../auth/line-auth";
import { EcpayReviewLogin } from "../auth/EcpayReviewLogin";
import { usePermissionSettings } from "../permission-settings";
import { signInWithGoogle } from "../auth/google-auth";
import { clearLineLoginAttempt, consumeLineLoginAttempt, markLineLoginAttempt } from "../auth/line-login-attempt";
import { logicalSessionIdentity } from "../auth/session-identity";
import { getAlgorithmCacheScope, subscribeAlgorithmCacheScope } from "../auth/algorithm-cache-scope";
import {
  MEMBER_SESSION_READ_TIMEOUT_MS,
  requestMemberSessionRefresh,
  useMemberSessionSnapshot,
} from "../auth/member-session-store";
import { useAppDialog } from "../dialog/AppDialog";
import { usePwaLifecycle } from "../pwa-lifecycle";
import { useSubscriptionPurchaseVisible } from "../subscription-purchase-visibility";
import { Navigate, ScreenId } from "./navigation";
import { FeatureShell, SectionTitle } from "./shared";
import { MATRIX_PRO_COMMON_FEATURES } from "../matrix-pro-copy";
import { beginEcpayCheckout } from "../ecpay-checkout";

type SubscriptionVisualTier = "free" | "monthly" | "quarterly" | "yearly" | "lifetime";

/** Keep the approved raster artwork intact; mask sample text and the sample photo.
 *  All visible member data and interactive labels are rendered by ProfilePage.
 */
function MembershipArtwork({ showSubscription, maskAuthPill }: { showSubscription: boolean; maskAuthPill: boolean }) {
  const maskId = useId();
  const headingClipId = `${maskId}-heading`;
  const informationClipId = `${maskId}-information`;
  const source = "/assets/lottery/membership/membership-ab-reference.png";
  return (
    <div className="membership-reference-art" data-subscription-visible={showSubscription} aria-hidden="true">
      <svg viewBox={showSubscription ? "0 48 1563 692" : "0 48 1563 339"} preserveAspectRatio="none" focusable="false">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1563" height="1006">
            <rect width="1563" height="1006" fill="white" />
            <circle cx="225" cy="216" r="111" fill="black" />
            <rect x="388" y="132" width="490" height="81" fill="black" />
            <rect x="388" y="235" width="516" height="57" fill="black" />
            {maskAuthPill
              ? <rect className="profile-auth-pill-mask" x="1235" y="145" width="285" height="110" rx="55" fill="black" />
              : <rect className="profile-auth-pill-mask" x="1280" y="180" width="145" height="67" fill="black" />}
            <rect x="145" y="423" width="410" height="84" fill="black" />
            <rect x="320" y="528" width="473" height="207" fill="black" />
            <rect x="906" y="528" width="430" height="207" fill="black" />
            <rect x="530" y="793" width="540" height="76" fill="black" />
            <rect x="65" y="412" width="82" height="112" fill="black" />
            <rect x="565" y="418" width="920" height="93" fill="black" />
            <rect x="86" y="522" width="222" height="214" fill="black" />
            <rect x="800" y="534" width="39" height="196" fill="black" />
          </mask>
          <clipPath id={headingClipId} clipPathUnits="userSpaceOnUse">
            <rect x="565" y="418" width="920" height="93" />
          </clipPath>
          <clipPath id={informationClipId} clipPathUnits="userSpaceOnUse">
            <rect x="86" y="522" width="222" height="214" />
          </clipPath>
        </defs>
        <image href={source} width="1563" height="1006" mask={`url(#${maskId})`} />
      </svg>
      {showSubscription && <>
      <svg viewBox="0 738 1563 2" preserveAspectRatio="none" focusable="false">
        <image href={source} width="1563" height="1006" />
      </svg>
      <svg viewBox="0 740 1563 191" preserveAspectRatio="none" focusable="false">
        <image href={source} width="1563" height="1006" mask={`url(#${maskId})`} />
      </svg>
      <svg className="subscription-heading-mark" viewBox="65 412 82 112" preserveAspectRatio="none" focusable="false">
        <image href={source} width="1563" height="1006" />
      </svg>
      <svg className="subscription-heading-art" viewBox="0 387 1563 353" preserveAspectRatio="none" focusable="false">
        <image href={source} width="1563" height="1006" clipPath={`url(#${headingClipId})`} />
      </svg>
      <svg className="subscription-information-art" viewBox="0 387 1563 353" preserveAspectRatio="none" focusable="false">
        <image href={source} width="1563" height="1006" clipPath={`url(#${informationClipId})`} />
      </svg>
      </>}
    </div>
  );
}

export type TaipeiCalendarDate = { year: number; month: number; day: number };

export function taipeiCalendarDate(value: Date): TaipeiCalendarDate | null {
  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    ? { year, month, day }
    : null;
}

export function memberExpiryInTaipei(planExpiresAt: string | null): { date: string; remainingDays: number } | null {
  if (!planExpiresAt) return null;
  const expiry = taipeiCalendarDate(new Date(planExpiresAt));
  const today = taipeiCalendarDate(new Date());
  if (!expiry || !today) return null;
  const toDayNumber = ({ year, month, day }: TaipeiCalendarDate) => Date.UTC(year, month - 1, day) / 86_400_000;
  return {
    date: `${expiry.year}/${String(expiry.month).padStart(2, "0")}/${String(expiry.day).padStart(2, "0")}`,
    remainingDays: Math.max(0, toDayNumber(expiry) - toDayNumber(today)),
  };
}

export function lineAvatarFromSession(session: unknown) {
  if (!session || typeof session !== "object") return null;
  const user = (session as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const metadata = (user as { user_metadata?: unknown }).user_metadata;
  if (metadata && typeof metadata === "object") {
    const picture = (metadata as { picture?: unknown }).picture;
    if (typeof picture === "string" && picture.trim()) return picture.trim();
  }
  const identities = (user as { identities?: unknown }).identities;
  if (!Array.isArray(identities)) return null;
  const lineIdentity = identities.find((identity) => (
    identity && typeof identity === "object"
    && (identity as { provider?: unknown }).provider === "custom:line"
  ));
  const identityData = lineIdentity && typeof lineIdentity === "object"
    ? (lineIdentity as { identity_data?: unknown }).identity_data
    : null;
  if (!identityData || typeof identityData !== "object") return null;
  const picture = (identityData as { picture?: unknown }).picture;
  return typeof picture === "string" && picture.trim() ? picture.trim() : null;
}

export function lineNicknameFromSession(session: unknown) {
  if (!session || typeof session !== "object") return null;
  const user = (session as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const displayName = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    for (const key of ["name", "full_name", "display_name"] as const) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return null;
  };
  const metadataName = displayName((user as { user_metadata?: unknown }).user_metadata);
  if (metadataName) return metadataName;
  const identities = (user as { identities?: unknown }).identities;
  if (!Array.isArray(identities)) return null;
  for (const provider of ["custom:line", "google"]) {
    const identity = identities.find((candidate) => (
      candidate && typeof candidate === "object"
      && (candidate as { provider?: unknown }).provider === provider
    ));
    if (!identity || typeof identity !== "object") continue;
    const identityName = displayName((identity as { identity_data?: unknown }).identity_data);
    if (identityName) return identityName;
  }
  return null;
}

export type ProfileAuthState =
  | "initializing"
  | "anonymous"
  | "signing-in"
  | "authenticated"
  | "signing-out"
  | "degraded";

export const PROFILE_SESSION_TIMEOUT_MS = MEMBER_SESSION_READ_TIMEOUT_MS;

export function ProfilePage({ onNavigate }: { onNavigate: Navigate }) {
  const ecpayReviewLoginVisible = usePermissionSettings()?.ecpayReviewLoginVisible === true;
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const { confirm: confirmDialog, alert: alertDialog } = useAppDialog();
  const { showInstallAction, requestInstall } = usePwaLifecycle();
  const [authState, setAuthState] = useState<ProfileAuthState>("initializing");
  const [authRetrying, setAuthRetrying] = useState(false);
  const memberSession = useMemberSessionSnapshot();
  const lineLoginInProgress = useRef(false);
  const useDirectLineBrowserLink = useMemo(() => shouldUseDirectLineBrowserLink(), []);
  const [lineBrowserLoginUrl, setLineBrowserLoginUrl] = useState<string | null>(null);
  const [lineBrowserLoginUnavailable, setLineBrowserLoginUnavailable] = useState(false);
  const [signingInProvider, setSigningInProvider] = useState<"line" | "google" | null>(null);
  const [lineAvatarUrl, setLineAvatarUrl] = useState<string | null>(null);
  const [memberNickname, setMemberNickname] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  const memberUserIdRef = useRef<string | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberProfileResponse | null>(null);
  useEffect(() => {
    if (!useDirectLineBrowserLink) return;
    let active = true;
    void prepareLineLoginUrl().then((url) => {
      if (!active) return;
      setLineBrowserLoginUrl(url);
      setLineBrowserLoginUnavailable(false);
    }).catch(() => {
      if (!active) return;
      setLineBrowserLoginUrl(null);
      setLineBrowserLoginUnavailable(true);
    });
    return () => { active = false; };
  }, [useDirectLineBrowserLink]);
  useEffect(() => {
    if (memberSession.status === "checking") {
      setAuthState((current) => current === "signing-in" || current === "signing-out" ? current : "initializing");
      return;
    }
    if (memberSession.status === "error") {
      reconcilePendingLineLogoutPresence(undefined);
      setAuthRetrying(false);
      consumeLineLoginAttempt({ hasSession: false });
      setAuthState("degraded");
      setMemberProfile(null);
      return;
    }

    const session = memberSession.session;
    // Supabase can broadcast the callback session before the PWA handoff is
    // acknowledged. Keep the login button pending until this attempt settles.
    if (session && lineLoginInProgress.current) return;
    reconcilePendingLineLogoutPresence(session);
    const userId = session?.user?.id ?? null;
    if (memberUserIdRef.current !== userId) {
      memberUserIdRef.current = userId;
      setMemberUserId(userId);
      setMemberProfile(null);
    }
    setAuthRetrying(false);
    setSigningInProvider(null);
    setAuthState(session ? "authenticated" : "anonymous");
    setLineAvatarUrl(lineAvatarFromSession(session));
    setMemberNickname(lineNicknameFromSession(session));
    if (consumeLineLoginAttempt({ hasSession: Boolean(session) })) {
      void alertDialog({ title: "登入成功", tone: "success" });
    }
  }, [alertDialog, memberSession]);
  useEffect(() => {
    if (authState !== "authenticated") {
      if (authState === "anonymous" || authState === "degraded") setMemberProfile(null);
      return;
    }
    let active = true;
    const userId = memberUserId;
    void bootstrapMember().then(() => {
      if (!active || memberUserIdRef.current !== userId) return null;
      return fetchMemberProfile();
    }).then((profile) => {
      if (active && memberUserIdRef.current === userId) setMemberProfile(profile);
    }).catch(() => {
      if (active) setMemberProfile(null);
    });
    return () => { active = false; };
  }, [authState, memberUserId]);
  const expiry = memberProfile?.isLifetime ? null : memberExpiryInTaipei(memberProfile?.planExpiresAt ?? null);
  const displayedPlanName = memberProfile ? memberProfile.planName ?? "免費會員" : "";
  const displayedPlanDescription = displayedPlanName === "免費會員" ? "核心功能體驗" : "Matrix Pro 權限";
  const subscriptionVisualTier: SubscriptionVisualTier = memberProfile?.isLifetime ? "lifetime"
    : displayedPlanName.includes("月費") ? "monthly"
      : displayedPlanName.includes("季費") ? "quarterly"
        : displayedPlanName.includes("年費") ? "yearly"
          : displayedPlanName.includes("終身") || displayedPlanName.includes("終生") ? "lifetime" : "free";
  const handleAuthAction = async () => {
    if (authRetrying || authState === "initializing" || authState === "signing-in" || authState === "signing-out") return;
    if (authState === "degraded") {
      setAuthRetrying(true);
      try {
        await requestMemberSessionRefresh();
      } catch {
        setAuthState("degraded");
      } finally {
        setAuthRetrying(false);
      }
      return;
    }
    const action = authState === "authenticated" ? "logout" : "login";
    try {
      if (action === "logout") {
        setAuthState("signing-out");
        const confirmed = await confirmDialog({
          title: "確認登出？",
          description: "登出後需重新登入才能繼續使用帳號功能。",
          confirmLabel: "確認登出",
          cancelLabel: "取消",
          tone: "warning",
          icon: "logout",
        });
        if (!confirmed) {
          setAuthState("authenticated");
          return;
        }
        await signOutFromMatrix();
        setAuthState("anonymous");
        setLineAvatarUrl(null);
        setMemberNickname(null);
        await alertDialog({ title: "已登出", tone: "success" });
      } else {
        setSigningInProvider("line");
        setAuthState("signing-in");
        markLineLoginAttempt();
        lineLoginInProgress.current = true;
        try {
          const completedInPwa = await signInWithLine();
          if (completedInPwa === 'pwa') {
            clearLineLoginAttempt();
            setAuthState('authenticated');
            await alertDialog({ title: '登入成功', tone: 'success' });
            onNavigate('home');
          }
        } catch (error) {
          clearLineLoginAttempt();
          throw error;
        } finally {
          lineLoginInProgress.current = false;
        }
      }
    } catch (error) {
      if (action === 'login' && error instanceof Error && error.message === 'LINE_LOGIN_INCOMPLETE') {
        // The callback may already have signed in through Supabase's cross-tab
        // broadcast even if the native app/browser lost the popup connection.
        try {
          const session = await requestMemberSessionRefresh();
          if (session) {
            memberUserIdRef.current = session.user.id;
            setMemberUserId(session.user.id);
            setMemberProfile(null);
            setAuthState('authenticated');
            setLineAvatarUrl(lineAvatarFromSession(session));
            setMemberNickname(lineNicknameFromSession(session));
            await alertDialog({ title: '登入成功', tone: 'success' });
            onNavigate('home');
            return;
          }
          setAuthState('anonymous');
        } catch {
          setAuthState('degraded');
        }
      } else {
        setAuthState(action === "logout"
          && error instanceof Error
          && error.message === "SUPABASE_SIGN_OUT_UNCERTAIN"
          ? "degraded"
          : action === "logout" ? "authenticated" : "anonymous");
      }
      await alertDialog({
        title: action === "logout" ? "登出失敗" : "登入失敗",
        description: "請稍後再試。",
        tone: "danger",
      });
    } finally {
      if (action === "login") setSigningInProvider(null);
      setAuthState((current) => current === "signing-in" ? "anonymous" : current);
    }
  };
  const handleGoogleAuthAction = async () => {
    if (authRetrying || authState !== "anonymous") return;
    setSigningInProvider("google");
    setAuthState("signing-in");
    try {
      // Supabase signInWithOAuth owns the browser redirect. Keep the UI in the
      // signing-in state until navigation unloads this page or the auth callback
      // restores a session.
      await signInWithGoogle();
    } catch {
      setSigningInProvider(null);
      setAuthState("anonymous");
      await alertDialog({
        title: "登入失敗",
        description: "Google 登入目前無法使用，請稍後再試。",
        tone: "danger",
      });
    }
  };
  const handleInstallAction = async () => {
    const result = await requestInstall();
    if (result === "ios-instructions") {
      await alertDialog({
        title: "加入主畫面",
        description: "請點選瀏覽器的分享按鈕，再選擇「加入主畫面」。",
      });
    }
  };
  const menuGroups: Array<{ title: string; items: Array<[string, ScreenId]> }> = [
    { title: "會員相關", items: [["付款紀錄", "payment-history"]] },
    { title: "推廣相關", items: [["我的推薦碼/啟動碼", "activation-code"], ["優惠活動", "promotions"]] },
    { title: "法律資訊", items: [["關於 樂彩 Matrix", "about-matrix"], ["服務內容與使用說明", "service-info"], ["會員服務條例", "member-terms"], ["隱私權政策", "privacy-policy"], ["退款規範", "refund-policy"], ["聲明與免責事項", "disclaimer"]] },
    { title: "系統相關", items: [["通知設定", "notifications"], ["版本資訊/更新紀錄", "version-info"]] },
    { title: "客服與支援", items: [["聯絡客服/問題回報/商務合作", "merchant-info"]] },
  ];

  return (
    <FeatureShell title="我的" onNavigate={onNavigate} active="我的" className="profile-screen" compactHeader>
      <div className="membership-card-stack">
        <MembershipArtwork showSubscription={true} maskAuthPill={authState === "anonymous" || authState === "signing-in"} />
        <section className="panel membership-card profile-card" data-review-login={ecpayReviewLoginVisible} data-auth-layout={authState === "anonymous" || authState === "signing-in" ? "multiple" : "single"}>
          <div className="profile-avatar">
            <img
              src={lineAvatarUrl ?? "/assets/lottery/matrix-profile-avatar.jpg"}
              alt={lineAvatarUrl ? "會員頭貼" : "Matrix 預設頭貼"}
            />
          </div>
          <div className="profile-copy">
            <h2>樂彩玩家</h2>
            <p
              className="profile-nickname"
              data-name-fit={memberNickname && Array.from(memberNickname).length > 12 ? "compact" : "regular"}
            >{memberNickname ?? ""}</p>
          </div>
          {authState !== "initializing" ? <div className="profile-auth-actions">
            {authState === "anonymous" || authState === "signing-in" ? <>
              {ecpayReviewLoginVisible && <EcpayReviewLogin disabled={authState === "signing-in"} />}
              {useDirectLineBrowserLink && !lineBrowserLoginUnavailable ? (
                lineBrowserLoginUrl && authState === "anonymous" ? <a
                  role="button"
                  href={lineBrowserLoginUrl}
                  className="profile-logout"
                  data-auth-state={authState}
                  data-login-provider="line"
                  aria-label="LINE 登入"
                  onClick={() => markLineLoginAttempt()}
                ><span>LINE</span></a> : <button
                  type="button"
                  className="profile-logout"
                  data-auth-state={authState}
                  data-login-provider="line"
                  aria-label="LINE 登入"
                  disabled
                ><span>LINE</span></button>
              ) : <button
                type="button"
                className="profile-logout"
                data-auth-state={authState}
                data-login-provider="line"
                aria-label={signingInProvider === "line" ? "登入中…" : "LINE 登入"}
                onClick={() => void handleAuthAction()}
                disabled={authState === "signing-in"}
                aria-busy={signingInProvider === "line"}
              ><span>{signingInProvider === "line" ? "登入中…" : "LINE"}</span></button>}
              <button
                type="button"
                className="profile-logout"
                data-auth-state={authState}
                data-login-provider="google"
                aria-label={signingInProvider === "google" ? "Google 登入中…" : "Google 登入"}
                onClick={() => void handleGoogleAuthAction()}
                disabled={authState === "signing-in"}
                aria-busy={signingInProvider === "google"}
              ><span>{signingInProvider === "google" ? "登入中…" : "Google"}</span></button>
            </> : <button
              type="button"
              className="profile-logout"
              data-auth-state={authState}
              onClick={() => void handleAuthAction()}
              disabled={authRetrying || authState === "signing-out"}
              aria-busy={authRetrying || authState === "signing-out"}
            ><span>{
              authState === "authenticated" ? "登出"
                : authState === "signing-out" ? "登出中…"
                  : "重新檢查"
            }</span></button>}
          </div> : null}
        </section>
        <section className="panel membership-card subscription-status-card" data-plan-tier={subscriptionVisualTier}>
          <SectionTitle>目前訂閱狀態</SectionTitle>
          <div className="subscription-status-stage">
            <div className="subscription-status-emblem" aria-hidden="true" />
            <div className="subscription-status-content">
              <div className="subscription-plan"><span>目前方案</span><strong>{displayedPlanName}</strong><p>{memberProfile ? displayedPlanDescription : ""}</p></div>
              <div className="subscription-expiry"><span>訂閱到期日</span><strong>{memberProfile?.isLifetime ? "無到期日" : expiry?.date ?? ""}</strong><p>{expiry ? `剩餘 ${expiry.remainingDays} 天` : ""}</p></div>
            </div>
          </div>
          {subscriptionPurchaseVisible && <button type="button" className="subscription-entry" onClick={() => onNavigate("pro-plans")}>
            <span>訂閱方案／收費標準</span><ChevronRightIcon />
          </button>}
        </section>
      </div>
      {menuGroups.map((group) => (
        <ProfileMenu title={group.title} items={group.items} onNavigate={onNavigate} key={group.title}>
          {group.title === "系統相關" && showInstallAction ? (
            <button type="button" onClick={() => void handleInstallAction()}>
              <span>安裝 樂彩 Matrix</span><ChevronRightIcon />
            </button>
          ) : null}
        </ProfileMenu>
      ))}
    </FeatureShell>
  );
}

export function ProfileMenu({ title, items, onNavigate, children }: { title: string; items: Array<[string, ScreenId]>; onNavigate: Navigate; children?: ReactNode }) {
  return (
    <section className="panel profile-menu">
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      <div className="profile-menu-rows">
        {items.map(([label, screen]) => (
          <button type="button" key={screen} onClick={() => onNavigate(screen)}>
            <span>{label}</span><ChevronRightIcon />
          </button>
        ))}
        {children}
      </div>
    </section>
  );
}

export function ProfileDetailShell({ title, children, onNavigate, className = "" }: { title: string; children?: React.ReactNode; onNavigate: Navigate; className?: string }) {
  return (
    <FeatureShell title={title} onNavigate={onNavigate} active="我的" backTarget="profile" compactHeader className={`profile-detail-screen ${className}`.trim()}>
      {children}
    </FeatureShell>
  );
}

export function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel detail-card"><h2>{title}</h2><div>{children}</div></section>;
}

export function DetailList({ items }: { items: string[] }) {
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function LegalInfoDocument({ title, children, onNavigate }: { title: string; children: ReactNode; onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title={title} onNavigate={onNavigate} className="profile-info-screen">
      <article className="panel legal-info-document" aria-label={title}>
        <h1>{title}</h1>
        {children}
      </article>
    </ProfileDetailShell>
  );
}

function LegalInfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-info-section">
      <h2>{title}</h2>
      <div className="legal-info-copy">{children}</div>
    </section>
  );
}

const subscribeMemberScope = (listener: () => void) => subscribeAlgorithmCacheScope(listener, { notifyOnInitialize: true });
function useMemberSessionScope() {
  return useSyncExternalStore(subscribeMemberScope, getAlgorithmCacheScope, getAlgorithmCacheScope);
}

function useSubscriptionProfile() {
  const scope = useMemberSessionScope();
  const [result, setResult] = useState<{ scope: number; profile: MemberProfileResponse | null; error: boolean }>({ scope, profile: null, error: false });
  useEffect(() => {
    let cancelled = false;
    setResult({ scope, profile: null, error: false });
    void fetchMemberProfile().then((value) => {
      if (!cancelled && scope === getAlgorithmCacheScope()) setResult({ scope, profile: value, error: false });
    }).catch(() => {
      if (!cancelled && scope === getAlgorithmCacheScope()) setResult({ scope, profile: null, error: true });
    });
    return () => { cancelled = true; };
  }, [scope]);
  return result.scope === scope ? result : { profile: null, error: false };
}

export function SubscriptionManagementPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const { profile, error } = useSubscriptionProfile();
  const placeholder = error ? "會員資料載入失敗" : "讀取中";
  const expiry = profile?.isLifetime ? "無到期日" : memberExpiryInTaipei(profile?.planExpiresAt ?? null)?.date ?? "無訂閱到期日";
  return (
    <ProfileDetailShell title="管理訂閱" onNavigate={onNavigate}>
      <DetailCard title="目前方案"><p>{profile ? profile.isLifetime ? "永久會員" : profile.planName ?? "未訂閱" : placeholder}</p></DetailCard>
      <DetailCard title="訂閱到期日"><p>{profile ? expiry : placeholder}</p></DetailCard>
      {subscriptionPurchaseVisible && <button type="button" className="confirm-payment" onClick={() => onNavigate("pro-plans")}>訂閱方案／收費標準</button>}
    </ProfileDetailShell>
  );
}

export const transferStatusLabels = {
  pending: "待確認",
  confirmed: "已確認",
  rejected: "已退回",
} as const;

export const paymentStatusLabels = {
  ...transferStatusLabels,
  failed: "付款失敗",
  refund_required: "需退款處理",
  refunded: "已退款",
  chargeback: "已刷退",
  cancelled: "交易已取消",
} as const;

const purchasePlanRank: Record<ManualTransferPlanCode, number> = { month: 1, quarter: 2, year: 3 };
const currentPlanRank: Record<string, number> = { 月費方案: 1, 季費方案: 2, 年費方案: 3 };

function purchaseBlockReason(profile: MemberProfileResponse | null, error: boolean, code: ManualTransferPlanCode): string | null {
  if (error) return "會員資料載入失敗，請稍後重新開啟方案頁。";
  if (!profile) return "正在讀取會員資料，請稍候。";
  if (profile.isLifetime) return "永久會員無需再購買月／季／年方案。";
  const expiry = profile.planExpiresAt ? Date.parse(profile.planExpiresAt) : 0;
  if (profile.planExpiresAt && !Number.isFinite(expiry)) return "暫時無法確認訂閱狀態，請稍後重新開啟方案頁。";
  if (expiry > Date.now() && (currentPlanRank[profile.planName ?? ""] ?? 0) > purchasePlanRank[code]) {
    return `目前有效的${profile.planName}無法購買較低方案；可選擇同級或升級。`;
  }
  return null;
}

let checkoutPending = false;
const checkoutListeners = new Set<() => void>();
const subscribeCheckout = (listener: () => void) => {
  checkoutListeners.add(listener);
  return () => { checkoutListeners.delete(listener); };
};
const getCheckoutPending = () => checkoutPending;
const setCheckoutPending = (value: boolean) => {
  checkoutPending = value;
  checkoutListeners.forEach((listener) => listener());
};

export function ProPlansPage({ onNavigate }: { onNavigate: Navigate }) {
  const appDialog = useAppDialog();
  const paymentInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [paymentStarting, setPaymentStarting] = useState(false);
  const checkoutBusy = useSyncExternalStore(subscribeCheckout, getCheckoutPending, getCheckoutPending);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const { profile: renewalProfile, error: renewalProfileError } = useSubscriptionProfile();
  const plans = [
    { code: "month", name: "月費方案", price: "$2,880", days: 30, icons: [], features: [...MATRIX_PRO_COMMON_FEATURES] },
    { code: "quarter", name: "季費方案", price: "$5,580", days: 90, icons: [{ src: "/assets/matrix-explore/tianyan.jpg", alt: "天衍" }], features: ["Matrix 天衍 - 使用權限", ...MATRIX_PRO_COMMON_FEATURES] },
    { code: "year", name: "年費方案", price: "$17,800", days: 365, icons: [{ src: "/assets/matrix-explore/tianyan.jpg", alt: "天衍" }, { src: "/assets/matrix-explore/tiangong.jpg", alt: "天工" }], features: ["Matrix 天衍 - 使用權限", "Matrix 天工 - 使用權限", ...MATRIX_PRO_COMMON_FEATURES] },
  ] as const;
  const carouselPlans = [plans[2], ...plans, plans[0]] as const;
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const selected = plans[selectedPlan];
  const restriction = purchaseBlockReason(renewalProfile, renewalProfileError, selected.code);
  const restrictionRef = useRef(restriction);
  restrictionRef.current = restriction;
  const selectedCodeRef = useRef(selected.code);
  selectedCodeRef.current = selected.code;
  const scrollToCarouselPosition = (position: number, behavior: ScrollBehavior = "auto") => {
    const carousel = carouselRef.current;
    const card = carousel?.querySelector<HTMLElement>(`[data-carousel-position="${position}"]`);
    if (!carousel || !card) return;
    const left = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
    carousel.scrollTo({ left, behavior });
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToCarouselPosition(1));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  }, []);
  const handleCarouselScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const center = carousel.scrollLeft + carousel.clientWidth / 2;
    const cards = Array.from(carousel.querySelectorAll<HTMLElement>(".plan-card"));
    const nearest = cards.reduce((current, card) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const currentCenter = current.offsetLeft + current.clientWidth / 2;
      return Math.abs(cardCenter - center) < Math.abs(currentCenter - center) ? card : current;
    }, cards[0]);
    if (!nearest) return;
    setSelectedPlan(Number(nearest.dataset.planIndex));
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const position = Number(nearest.dataset.carouselPosition);
      if (position === 0) scrollToCarouselPosition(plans.length);
      if (position === plans.length + 1) scrollToCarouselPosition(1);
    }, 140);
  };
  const renewedDate = useMemo(() => {
    if (renewalProfileError) return "暫時無法計算";
    if (!renewalProfile) return "讀取中";
    const expiry = renewalProfile.planExpiresAt ? Date.parse(renewalProfile.planExpiresAt) : 0;
    if (!Number.isFinite(expiry)) return "暫時無法計算";
    if (restriction) return "不適用";
    const renewedAt = Math.max(Date.now(), expiry) + selected.days * 86_400_000;
    return memberExpiryInTaipei(new Date(renewedAt).toISOString())?.date ?? "暫時無法計算";
  }, [selected.days, renewalProfile, renewalProfileError, restriction]);
  const handlePayment = async () => {
    if (paymentInFlight.current || checkoutPending || restrictionRef.current) return;
    paymentInFlight.current = true;
    setCheckoutPending(true);
    const memberScope = getAlgorithmCacheScope();
    const isCurrent = () => mounted.current && memberScope === getAlgorithmCacheScope();
    let submitted = false;
    try {
      if (!await appDialog.confirm({ title: `確認以${selected.name}進行付款？`, confirmLabel: "確認付款" })) return;
      if (!isCurrent() || restrictionRef.current || selectedCodeRef.current !== selected.code) return;
      setPaymentStarting(true);
      setPaymentError(null);
      const result = await beginEcpayCheckout(selected.code, { isCurrent });
      if (!isCurrent()) return;
      if (result === 'manual') {
        saveManualTransferPlan(selected.code);
        onNavigate("manual-transfer");
      } else {
        submitted = true;
      }
    } catch {
      if (isCurrent()) {
        setPaymentError('無法開啟付款頁面，請稍後再試。');
      }
    } finally {
      setCheckoutPending(false);
      if (!submitted) {
        paymentInFlight.current = false;
        if (mounted.current) setPaymentStarting(false);
      }
    }
  };
  return (
    <ProfileDetailShell title="訂閱方案與收費標準" onNavigate={onNavigate} className="pro-plans-screen">
      <div className="plan-carousel" aria-label="Matrix Pro 會員方案" ref={carouselRef} onScroll={handleCarouselScroll}>
        {carouselPlans.map((plan, position) => {
          const planIndex = position === 0 ? plans.length - 1 : position === plans.length + 1 ? 0 : position - 1;
          return <article className={`plan-card${plan.icons.length > 0 ? " plan-card--with-tools" : ""}`} data-current={selectedPlan === planIndex} data-plan-index={planIndex} data-carousel-position={position} key={`${plan.name}-${plan.days}-${position}`}>
          <div className="plan-card-heading">
            <span className="plan-name">{plan.name}</span>
            {plan.icons.length > 0 ? <div className={`plan-tool-icons${plan.icons.length > 1 ? " plan-tool-icons--stacked" : ""}`} aria-label={`${plan.name}開放工具`}>
              {plan.icons.map((icon) => <span className="plan-tool-icon" key={icon.alt}><img src={icon.src} alt={icon.alt} /></span>)}
            </div> : null}
          </div>
          <strong>{plan.price}<small>／{plan.days}天</small></strong>
          <h2>Matrix Pro 權限：</h2>
          <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        </article>})}
      </div>
      <div className="pro-plans-checkout">
        <section className="panel renewal-card">
          <h2>管理訂閱／續訂方案</h2>
          <dl>
            <div><dt>已選方案：</dt><dd>{selected.name}</dd></div>
            <div><dt>付款金額：</dt><dd>{selected.price}</dd></div>
            <div><dt>新增效期：</dt><dd>{selected.days}天</dd></div>
            <div><dt>續訂後到期日：</dt><dd>{renewedDate}</dd></div>
          </dl>
          <div className="auto-renew-setting">
            <label>
              <input type="checkbox" checked={false} disabled readOnly />
              <span>自動續訂</span>
            </label>
            <strong data-active={false}>目前狀態：關閉</strong>
          </div>
        </section>
        <button type="button" className="confirm-payment primary-action branded-explore-action" onClick={handlePayment} disabled={checkoutBusy || paymentStarting || Boolean(restriction)} aria-describedby={restriction ? "plan-purchase-restriction" : undefined}><span>{checkoutBusy || paymentStarting ? "正在開啟付款頁面…" : "確定付款"}</span></button>
        {restriction && <p className="payment-note" id="plan-purchase-restriction" role="status">{restriction}</p>}
        {paymentError && <p className="payment-note" role="alert">{paymentError}</p>}
        {!restriction && <p className="payment-note">按下「確定付款」後，將進入目前提供的付款流程。</p>}
      </div>
    </ProfileDetailShell>
  );
}

export const manualTransferPlans: Record<ManualTransferPlanCode, { name: string; amount: number }> = {
  month: { name: "月費方案", amount: 2880 },
  quarter: { name: "季費方案", amount: 5580 },
  year: { name: "年費方案", amount: 17800 },
};

export function ManualTransferPage({ onNavigate }: { onNavigate: Navigate }) {
  const scope = useMemberSessionScope();
  const memberSession = useMemberSessionSnapshot();
  const initialAttempt = readManualTransferAttempt();
  const planCode = initialAttempt?.plan ?? readManualTransferPlan();
  if (memberSession.status === 'checking' && !planCode) {
    return <ProfileDetailShell title="銀行轉帳付款" onNavigate={onNavigate} className="manual-transfer-screen"><p role="status">登入狀態確認中…</p></ProfileDetailShell>;
  }
  return <ManualTransferForm key={`${scope}:${planCode}`} scope={scope} planCode={planCode} initialAttempt={initialAttempt} onNavigate={onNavigate} />;
}

function ManualTransferForm({ onNavigate, scope, planCode, initialAttempt }: { onNavigate: Navigate; scope: number; planCode: ManualTransferPlanCode | null; initialAttempt: ReturnType<typeof readManualTransferAttempt> }) {
  const plan = planCode ? manualTransferPlans[planCode] : null;
  const { profile, error: profileError } = useSubscriptionProfile();
  const [attempt, setAttempt] = useState(initialAttempt);
  const [serverRestriction, setServerRestriction] = useState<string | null>(null);
  const purchaseRestriction = planCode ? purchaseBlockReason(profile, profileError, planCode) : null;
  const restriction = serverRestriction ?? (!attempt ? purchaseRestriction : null);
  const [lastFive, setLastFive] = useState(initialAttempt?.lastFive ?? "");
  const [pending, setPending] = useState<MemberTransferRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(plan));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialAttempt ? "尚未確認提交結果，請重試確認。" : null);
  const [statusUnresolved, setStatusUnresolved] = useState(false);
  const showReceivingDetails = pending
    ? pending.status === 'pending' || pending.status === 'confirmed'
    : !loading && !statusUnresolved && !serverRestriction && !purchaseRestriction;
  const requestRevision = useRef(0);
  const submitInFlight = useRef(false);

  useEffect(() => {
    if (!plan) onNavigate("pro-plans");
  }, [onNavigate, plan]);

  const reloadPending = () => {
    if (!plan) return;
    const revision = ++requestRevision.current;
    const isCurrent = () => revision === requestRevision.current && scope === getAlgorithmCacheScope();
    setLoading(true);
    setError(null);
    void fetchPendingTransferRequest()
      .then((value) => {
        if (isCurrent()) {
          setPending(value);
          setStatusUnresolved(false);
          const unresolved = readManualTransferAttempt();
          if (value && unresolved?.requestId === value.id) {
            clearManualTransferAttempt(value.id);
            setAttempt(null);
          }
          if (!value && unresolved) setError("尚未確認提交結果，請重試確認。");
        }
      })
      .catch(() => {
        if (isCurrent()) {
          setStatusUnresolved(true);
          setError("無法讀取轉帳申請，請稍後再試。");
        }
      })
      .finally(() => { if (isCurrent()) setLoading(false); });
  };

  useEffect(() => {
    reloadPending();
    return () => { requestRevision.current += 1; };
  }, [plan, scope]);

  if (!plan || !planCode) return null;

  const submit = async () => {
    if (lastFive.length !== 5 || loading || statusUnresolved || submitInFlight.current || pending || restriction || scope !== getAlgorithmCacheScope()) return;
    const revision = ++requestRevision.current;
    const isCurrent = () => revision === requestRevision.current && scope === getAlgorithmCacheScope();
    submitInFlight.current = true;
    setSubmitting(true);
    setError(null);
    let requestStarted = false;
    let submittedRequestId: string | null = null;
    try {
      const requestId = reserveManualTransferAttempt(planCode, lastFive);
      const captured = readManualTransferAttempt();
      if (!captured || captured.requestId !== requestId) throw new Error('INVALID_TRANSFER_ATTEMPT');
      submittedRequestId = requestId;
      setAttempt(captured);
      requestStarted = true;
      const value = await submitTransferRequest(captured.plan, captured.lastFive, requestId);
      if (!value || typeof value !== 'object' || value.id !== requestId || !['pending', 'confirmed', 'rejected'].includes(value.status)) {
        throw new Error('INVALID_TRANSFER_RESPONSE');
      }
      if (isCurrent()) {
        clearManualTransferAttempt(requestId);
        setAttempt(null);
        setPending(value);
      }
    } catch (cause) {
      if (!isCurrent()) return;
      if (!requestStarted) {
        setError("無法儲存申請狀態，請稍後再試。");
        return;
      }
      const responseError = cause && typeof cause === 'object' ? cause as { code?: unknown; message?: unknown } : null;
      const rejected = responseError?.message;
      const rejectionCode = responseError?.code;
      const rejectedText = rejectionCode === 'P0001' && rejected === "PLAN_DOWNGRADE_BLOCKED"
        ? "目前方案無法購買較低方案，請重新選擇同級或升級方案。"
        : rejectionCode === 'P0001' && rejected === "LIFETIME_PURCHASE_BLOCKED"
          ? "永久會員無需再購買月／季／年方案。"
          : rejectionCode === '42501' && rejected === "PURCHASE_DISABLED"
            ? "目前無法購買方案，請稍後重新開啟方案頁。"
            : null;
      if (rejectedText) {
        if (submittedRequestId) clearManualTransferAttempt(submittedRequestId);
        setAttempt(null);
        setServerRestriction(rejectedText);
        return;
      }
      const pendingConflict = rejectionCode === '23505' && rejected === 'PENDING_TRANSFER_EXISTS';
      if (pendingConflict) {
        // The RPC checks this request ID before rejecting another pending transfer.
        if (submittedRequestId) clearManualTransferAttempt(submittedRequestId);
        setAttempt(null);
      }
      try {
        const value = await fetchPendingTransferRequest();
        if (isCurrent()) {
          setPending(value);
          setStatusUnresolved(false);
          if (value && value.id === submittedRequestId) {
            clearManualTransferAttempt(value.id);
            setAttempt(null);
          }
          if (!value && !pendingConflict) setError("尚未確認提交結果，請重試確認。");
        }
      } catch {
        if (isCurrent()) {
          setStatusUnresolved(true);
          setError("無法讀取轉帳申請，請稍後再試。");
        }
      }
    } finally {
      if (isCurrent()) {
        submitInFlight.current = false;
        setSubmitting(false);
      }
    }
  };

  return (
    <ProfileDetailShell title="銀行轉帳付款" onNavigate={onNavigate} className="manual-transfer-screen">
      <section className="panel detail-card manual-transfer-summary">
        <h2>付款方案</h2>
        <dl>
          <div><dt>方案</dt><dd>{pending?.planName ?? plan.name}</dd></div>
          <div><dt>金額</dt><dd>{`NT$${(pending?.amount ?? plan.amount).toLocaleString("en-US")}`}</dd></div>
        </dl>
      </section>
      {showReceivingDetails && <section className="panel detail-card manual-transfer-bank-card" aria-label="轉帳資料">
        <h2>轉帳資料</h2>
        <dl>
          <div><dt>收款銀行</dt><dd>連線銀行</dd></div>
          <div><dt>銀行代碼</dt><dd>824</dd></div>
          <div><dt>收款帳號</dt><dd className="manual-transfer-account">111023004501</dd></div>
          <div><dt>戶名</dt><dd>黎小姐</dd></div>
        </dl>
      </section>}
      <section className="panel detail-card manual-transfer-form-card">
        <h2>回報轉帳</h2>
        <label htmlFor="manual-transfer-last-five">帳號末五碼</label>
        <input
          id="manual-transfer-last-five"
          className="manual-transfer-last-five"
          inputMode="numeric"
          maxLength={5}
          value={lastFive}
          onChange={(event) => setLastFive(event.target.value.replace(/\D/g, "").slice(0, 5))}
          disabled={Boolean(pending) || Boolean(restriction) || Boolean(attempt) || submitting}
        />
        {restriction ? <p role={serverRestriction ? "alert" : "status"}>{restriction}</p> : null}
        {loading ? <p role="status">申請狀態載入中</p> : null}
        {pending ? <p className="manual-transfer-pending"><strong>{transferStatusLabels[pending.status]}</strong><span>{pending.status === "pending" ? "已有待確認申請" : pending.status === "confirmed" ? "申請已確認" : "申請已退回"}</span></p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {statusUnresolved ? <button type="button" className="primary-action branded-explore-action" disabled={loading || submitting} onClick={reloadPending}><span>重新載入申請狀態</span></button> : null}
        <button type="button" className="confirm-payment manual-transfer-submit" disabled={loading || statusUnresolved || submitting || Boolean(pending) || Boolean(restriction) || lastFive.length !== 5} onClick={() => void submit()}>{submitting ? "確認中" : attempt ? "重新確認申請" : "提交"}</button>
      </section>
    </ProfileDetailShell>
  );
}

export function AboutMatrixPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  return <ProfileDetailShell title="關於 樂彩 Matrix" onNavigate={onNavigate} className="profile-info-screen"><section className="panel detail-card about-matrix-card"><p className="about-welcome">歡迎使用 樂彩 Matrix</p><p>樂彩 Matrix 致力於提供清晰、{subscriptionPurchaseVisible ? "直覺且易於使用的開獎資料查詢與分析服務" : "直覺且易於使用的開獎資料查詢"}，協助使用者快速查閱公開資訊、整理歷史數據，{subscriptionPurchaseVisible ? "並透過多項分析功能" : "並透過多項查詢功能"}，提升資料檢視效率。</p><p>我們持續優化介面設計與操作體驗，{subscriptionPurchaseVisible ? "整合各項分析工具" : "整合各項查詢工具"}，讓不同需求的使用者都能以更簡單、更流暢的方式使用各項功能。</p><h2>我們的理念</h2><p>我們重視資料整理、操作效率與使用體驗，持續改善介面細節與功能品質，希望提供穩定、{subscriptionPurchaseVisible ? "且容易使用的分析工具" : "且容易使用的查詢工具"}，讓每一次資料查詢都更加便利。</p><p className="about-thanks">感謝您對 樂彩 Matrix 的支持與使用！</p><div className="about-brand-info"><p><span>品牌名稱：</span>樂彩 Matrix</p><p>Copyright © 2026 樂彩 Matrix. All Rights Reserved.</p></div></section></ProfileDetailShell>;
}

export function CollapsibleRuleCard({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const contentId = `referral-rule-${title}`;
  return <section className="referral-rule-card"><button type="button" className="referral-rule-toggle" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><span>{title}</span><ChevronRightIcon aria-hidden="true" /></button>{open ? <div className="referral-rule-content" id={contentId}>{children}</div> : null}</section>;
}

export const activationErrorText: Record<ActivationRedemptionErrorCode, string> = {
  INVALID_ACTIVATION_CODE_FORMAT: "啟動碼格式不正確",
  ACTIVATION_CODE_NOT_FOUND: "找不到此啟動碼",
  ACTIVATION_CODE_ALREADY_USED: "啟動碼已使用",
  ACTIVATION_CODE_EXPIRED: "啟動碼已過期",
  MEMBER_ALREADY_LIFETIME: "永久會員不需要延長訂閱天數",
  ACTIVATION_CODE_REDEMPTION_FAILED: "啟動失敗，請稍後再試",
};

export type ReferralSubmissionErrorCode =
  | "INVALID_REFERRAL_CODE"
  | "REFERRAL_CODE_NOT_FOUND"
  | "SELF_REFERRAL_NOT_ALLOWED"
  | "REFERRAL_CODE_ALREADY_SUBMITTED"
  | "REFERRAL_CODE_AFTER_PAYMENT"
  | "LINE_IDENTITY_REQUIRED"
  | "REFERRAL_CODE_SUBMISSION_FAILED";

export const referralErrorText: Record<ReferralSubmissionErrorCode, string> = {
  INVALID_REFERRAL_CODE: "請輸入推薦碼",
  REFERRAL_CODE_NOT_FOUND: "找不到此推薦碼",
  SELF_REFERRAL_NOT_ALLOWED: "不能輸入自己的推薦碼",
  REFERRAL_CODE_ALREADY_SUBMITTED: "此帳號已輸入過推薦碼",
  REFERRAL_CODE_AFTER_PAYMENT: "完成訂閱後無法再輸入推薦碼",
  LINE_IDENTITY_REQUIRED: "請先使用 LINE 或 Google 登入後再輸入推薦碼",
  REFERRAL_CODE_SUBMISSION_FAILED: "推薦碼儲存失敗，請稍後再試",
};

export function referralErrorCode(error: unknown): ReferralSubmissionErrorCode {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "";
  return (Object.keys(referralErrorText) as ReferralSubmissionErrorCode[])
    .find((code) => message.includes(code))
    ?? "REFERRAL_CODE_SUBMISSION_FAILED";
}

export function ActivationCodePage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const memberSession = useMemberSessionSnapshot();
  const memberSessionKey = memberSession.status === "ready"
    ? `ready:${logicalSessionIdentity(memberSession.session) ?? "guest"}`
    : memberSession.status;
  const activationLoginRequired = memberSession.status !== "ready" || !memberSession.session;
  const { confirm: confirmDialog } = useAppDialog();
  const [referralCode, setReferralCode] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [openRules, setOpenRules] = useState({ recognition: false, reward: false, supplement: false });
  const [activationInstructionsOpen, setActivationInstructionsOpen] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultState, setResultState] = useState<"idle" | "success" | ActivationRedemptionErrorCode>("idle");
  const [referralSummary, setReferralSummary] = useState<MemberReferralSummary | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [referralLoginRequired, setReferralLoginRequired] = useState(false);
  const [referralSubmitting, setReferralSubmitting] = useState(false);
  const [referralResultState, setReferralResultState] = useState<"idle" | "success" | ReferralSubmissionErrorCode>("idle");
  const [copySucceeded, setCopySucceeded] = useState(false);
  const activationRequestRevision = useRef(0);
  const referralRequestRevision = useRef(0);
  const copyFeedbackTimer = useRef<number | null>(null);
  const referralSuccessCount = referralSummary?.referralSuccessCount ?? 0;
  const myReferralCode = referralSummary?.referralCode ?? "—";

  function toggleRule(rule: keyof typeof openRules) {
    setOpenRules((current) => ({ ...current, [rule]: !current[rule] }));
  }

  async function copyReferralCode() {
    if (myReferralCode === "—") return;
    try {
      await navigator.clipboard.writeText(myReferralCode);
      setCopySucceeded(true);
      if (copyFeedbackTimer.current !== null) window.clearTimeout(copyFeedbackTimer.current);
      copyFeedbackTimer.current = window.setTimeout(() => {
        setCopySucceeded(false);
        copyFeedbackTimer.current = null;
      }, 1500);
    } catch {
      setCopySucceeded(false);
    }
  }

  useEffect(() => () => {
    activationRequestRevision.current += 1;
    if (copyFeedbackTimer.current !== null) window.clearTimeout(copyFeedbackTimer.current);
  }, []);

  useEffect(() => {
    let active = true;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    const revision = referralRequestRevision.current + 1;
    referralRequestRevision.current = revision;
    activationRequestRevision.current += 1;
    setActivationCode("");
    setSubmitting(false);
    setResultState("idle");
    setReferralSummary(null);
    setReferralCode("");
    setReferralSubmitting(false);
    setReferralResultState("idle");

    if (memberSession.status === "checking") {
      setReferralLoginRequired(false);
      setReferralLoading(true);
    } else if (memberSession.status === "error") {
      setReferralLoginRequired(false);
      setReferralLoading(false);
    } else {
      const session = memberSession.session;
      setReferralLoginRequired(!session);
      setReferralLoading(Boolean(session));
      if (session) {
        // Keep member API work outside the Supabase auth callback; the bridge has
        // already published this stable session snapshot.
        loadTimer = setTimeout(() => {
          void bootstrapMember().then(() => {
            if (!active || referralRequestRevision.current !== revision) return null;
            return fetchMemberReferralSummary();
          }).then((summary) => {
            if (summary && active && referralRequestRevision.current === revision) setReferralSummary(summary);
          }).catch((error: unknown) => {
            if (!active || referralRequestRevision.current !== revision) return;
            const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
            setReferralLoginRequired(["MEMBER_SESSION_EXPIRED", "AUTH_REQUIRED", "LINE_IDENTITY_REQUIRED"].includes(message));
          }).finally(() => {
            if (active && referralRequestRevision.current === revision) setReferralLoading(false);
          });
        }, 0);
      }
    }

    return () => {
      active = false;
      clearTimeout(loadTimer);
      if (referralRequestRevision.current === revision) referralRequestRevision.current += 1;
    };
  }, [memberSessionKey]);

  async function handleReferralSubmit() {
    if (referralSubmitting || !referralSummary?.canSubmitReferralCode || !referralCode.trim()) return;

    const sessionRevision = referralRequestRevision.current;
    setReferralSubmitting(true);
    const confirmed = await confirmDialog({
      title: "確認輸入推薦碼？",
      confirmLabel: "確認",
      cancelLabel: "取消",
    });
    if (referralRequestRevision.current !== sessionRevision) return;
    if (!confirmed) {
      setReferralSubmitting(false);
      return;
    }

    const requestRevision = referralRequestRevision.current + 1;
    referralRequestRevision.current = requestRevision;
    setReferralResultState("idle");

    try {
      const summary = await submitMemberReferralCode(referralCode);
      if (referralRequestRevision.current !== requestRevision) return;
      setReferralSummary(summary);
      setReferralCode("");
      setReferralResultState("success");
    } catch (error) {
      if (referralRequestRevision.current !== requestRevision) return;
      setReferralResultState(referralErrorCode(error));
    } finally {
      if (referralRequestRevision.current === requestRevision) setReferralSubmitting(false);
    }
  }

  async function handleActivation() {
    if (submitting || activationLoginRequired) return;

    const sessionRevision = activationRequestRevision.current;
    setSubmitting(true);
    const confirmed = await confirmDialog({
      title: "確認使用啟動碼？",
      confirmLabel: "確認",
      cancelLabel: "取消",
    });
    if (activationRequestRevision.current !== sessionRevision) return;
    if (!confirmed) {
      setSubmitting(false);
      return;
    }

    const requestRevision = activationRequestRevision.current + 1;
    activationRequestRevision.current = requestRevision;
    setResultState("idle");

    try {
      await redeemActivationCode(activationCode);
      if (activationRequestRevision.current !== requestRevision) return;
      setActivationCode("");
      setResultState("success");
    } catch (error) {
      if (activationRequestRevision.current !== requestRevision) return;
      setResultState(isActivationRedemptionError(error) ? error.code : "ACTIVATION_CODE_REDEMPTION_FAILED");
    } finally {
      if (activationRequestRevision.current === requestRevision) setSubmitting(false);
    }
  }

  return (
    <ProfileDetailShell title="我的推薦碼/啟動碼" onNavigate={onNavigate} className="activation-code-screen">
      <section className="panel referral-code-section" aria-label="推薦碼">
        <div className="referral-summary-card">
          <div className="referral-summary-heading">
            <h2>我的推薦碼</h2>
            <p className="referral-success-count">推薦成功 <strong className="referral-success-value">{referralSuccessCount}</strong> 人</p>
          </div>
          <div className="referral-code-row">
            <span className="referral-code-label">推薦碼：</span>
            <strong className="referral-code-value">{myReferralCode}</strong>
            <button type="button" className="gold-button referral-copy-button" onClick={() => void copyReferralCode()} disabled={myReferralCode === "—"} aria-live="polite">{copySucceeded ? <><CheckIcon aria-hidden="true" />複製成功</> : "複製推薦碼"}</button>
          </div>
        </div>
        <div className="referral-input-card">
          <h2>輸入推薦碼</h2>
          <div className="code-entry-block">
            <input id="referral-code" value={referralCode} onChange={(event) => {
              setReferralCode(event.target.value);
              setReferralResultState("idle");
            }} aria-label="推薦碼" disabled={referralLoading || !referralSummary?.canSubmitReferralCode} />
            <button type="button" className="primary-action branded-explore-action" onClick={() => void handleReferralSubmit()} disabled={referralLoading || referralSubmitting || !referralSummary?.canSubmitReferralCode || !referralCode.trim()}><span>確認</span></button>
          </div>
          {referralResultState === "success" && <p className="activation-result success" role="status">推薦碼已儲存</p>}
          {referralResultState !== "idle" && referralResultState !== "success" && <p className="activation-result error" role="alert">{referralErrorText[referralResultState]}</p>}
          {referralLoginRequired && <p className="activation-result" role="status">請先使用 LINE 或 Google 登入</p>}
          {!referralLoading && !referralLoginRequired && referralSummary === null && <p className="activation-result error" role="alert">推薦碼資訊暫時無法讀取，請稍後再試</p>}
        </div>
        <CollapsibleRuleCard title="推薦成功認定" open={openRules.recognition} onToggle={() => toggleRule("recognition")}>
          <DetailList items={[
            "每個 LINE 或 Google 帳號，僅能輸入一次推薦碼。",
            ...(subscriptionPurchaseVisible ? ["輸入推薦碼的帳號，完成訂閱 Matrix Pro 月方案、季方案或年方案任一方案後，該筆推薦即計為「推薦成功」。"] : []),
          ]} />
        </CollapsibleRuleCard>
        <CollapsibleRuleCard title="推薦成功獎勵" open={openRules.reward} onToggle={() => toggleRule("reward")}>
          <dl className="referral-rewards">
            {[
              { count: 10, feature: "七期", availability: "每週一、二、四、五開放" },
              { count: 15, feature: "七期", availability: "永久開放" },
              { count: 30, feature: "完整範圍", availability: "每週二、五開放" },
              { count: 50, feature: "完整範圍", availability: "永久開放" },
            ].map(({ count, feature, availability }) => (
              <div key={count}>
                <dt>推薦成功滿 <strong>{count}</strong> 人</dt>
                <dd><span>Matrix 探索 {feature}</span><span>{availability}</span></dd>
              </div>
            ))}
          </dl>
          <p className="referral-rewards-note">永久開放仍須維持對應的推薦成功人數門檻。</p>
        </CollapsibleRuleCard>
        {subscriptionPurchaseVisible && <CollapsibleRuleCard title="推薦獎勵補充規則" open={openRules.supplement} onToggle={() => toggleRule("supplement")}>
          <DetailList items={[
            "推薦獎勵不需本人訂閱 Matrix Pro。",
            "當達成對應的推薦成功人數門檻後，即可使用已解鎖的 Matrix 探索權限。",
            "若該筆訂閱發生退款、刷退或交易取消，該筆推薦成功將失效，推薦成功人數同步扣除。資格與獎勵依最新推薦成功人數重新計算；低於對應門檻時，已取得的對應獎勵同步取消。",
            "樂彩 Matrix 保留活動內容、參加資格、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。",
          ]} />
        </CollapsibleRuleCard>}
      </section>
      <section className="panel activation-code-section" aria-label="啟動碼">
        <div className="activation-card">
          <button
            type="button"
            className="activation-card-toggle"
            aria-expanded={activationOpen}
            aria-controls="activation-code-panel"
            onClick={() => setActivationOpen((current) => !current)}
          >
            <span>啟動碼</span>
            <ChevronRightIcon data-open={activationOpen} aria-hidden="true" />
          </button>
          <div id="activation-code-panel" className="activation-code-panel" hidden={!activationOpen}>
            <div className="code-entry-block" data-result-state={resultState} aria-busy={submitting}>
              <input id="activation-code" value={activationCode} onChange={(event) => {
                setActivationCode(event.target.value);
                setResultState("idle");
              }} aria-label="啟動碼" disabled={activationLoginRequired} />
              <button type="button" className="primary-action branded-explore-action" onClick={handleActivation} disabled={submitting || activationLoginRequired}><span>確認</span></button>
            </div>
            {resultState === "success" && <p className="activation-result success" role="status">啟動成功</p>}
            {resultState !== "idle" && resultState !== "success" && (
              <p className="activation-result error" role="alert">{activationErrorText[resultState]}</p>
            )}
          </div>
        </div>
        <CollapsibleRuleCard title="啟動碼使用說明" open={activationInstructionsOpen} onToggle={() => setActivationInstructionsOpen((current) => !current)}><ul>{subscriptionPurchaseVisible && <li>啟動碼以增加 Matrix Pro 訂閱天數為主要功能。</li>}<li>每組啟動碼只能成功使用一次。</li><li>啟動成功後，該組啟動碼立即標記為已使用。</li></ul></CollapsibleRuleCard>
      </section>
    </ProfileDetailShell>
  );
}

export function InviteFriendsPage({ onNavigate }: { onNavigate: Navigate }) {
  const scope = useMemberSessionScope();
  return <InviteFriendsContent key={scope} scope={scope} onNavigate={onNavigate} />;
}

function InviteFriendsContent({ onNavigate, scope }: { onNavigate: Navigate; scope: number }) {
  const [summary, setSummary] = useState<MemberReferralSummary | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const requestRevision = useRef(0);
  const loadReferralSummary = async () => {
    if (scope !== getAlgorithmCacheScope()) return;
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    setLoadState("loading");
    try {
      await bootstrapMember();
      if (revision !== requestRevision.current || scope !== getAlgorithmCacheScope()) return;
      const nextSummary = await fetchMemberReferralSummary();
      if (revision !== requestRevision.current || scope !== getAlgorithmCacheScope()) return;
      setSummary(nextSummary);
      setLoadState("ready");
    } catch {
      if (revision !== requestRevision.current || scope !== getAlgorithmCacheScope()) return;
      setSummary(null);
      setLoadState("error");
    }
  };
  useEffect(() => {
    void loadReferralSummary();
    return () => { requestRevision.current += 1; };
  }, []);
  const copyReferralCode = async () => {
    if (!summary?.referralCode || scope !== getAlgorithmCacheScope()) return;
    await navigator.clipboard?.writeText(summary.referralCode);
  };
  return <ProfileDetailShell title="邀請好友" onNavigate={onNavigate}><DetailCard title="邀請好友">{loadState === "loading" ? <p role="status">推薦資料載入中</p> : loadState === "error" ? <div role="alert"><span>推薦資料載入失敗</span><button type="button" aria-label="重新載入推薦資料" onClick={() => void loadReferralSummary()}>重新載入</button></div> : summary ? <div className="referral-share-card"><strong>{summary.referralCode}</strong><p>{`推薦成功 ${summary.referralSuccessCount} 人`}</p><button type="button" aria-label="複製推薦碼" onClick={() => void copyReferralCode()}>複製推薦碼</button></div> : null}</DetailCard></ProfileDetailShell>;
}

export function PromotionsPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="優惠活動" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="優惠活動"><p>目前沒有優惠活動。</p></DetailCard></ProfileDetailShell>;
}

export function ServiceInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  return (
    <LegalInfoDocument title="服務內容與使用說明" onNavigate={onNavigate}>
      <LegalInfoSection title="一、服務名稱">
        <p>樂彩 Matrix</p>
      </LegalInfoSection>
      <LegalInfoSection title="二、服務形式">
        <p>樂彩 Matrix 為可安裝於手機桌面的 PWA 服務。</p>
      </LegalInfoSection>
      <LegalInfoSection title="三、主要功能">
        <ul className="legal-info-functions">
          <li>
            Matrix Core
            <ul className="legal-info-subfunctions">
              <li>Matrix 探索</li>
              <li>Matrix 天衡</li>
              <li>Matrix 天樞</li>
              <li>Matrix 天衍</li>
              <li>Matrix 天工</li>
            </ul>
          </li>
          {["Matrix 狀態", "Matrix 同星", "號碼對照單", "連碰立柱計算機", "Matrix 牌單", "Matrix 指南", "歷史開獎紀錄", "Matrix 筆記本"].map((item) => <li key={item}>{item}</li>)}
        </ul>
      </LegalInfoSection>
      <LegalInfoSection title="四、支援彩種">
        <ul className="legal-info-lotteries">{["今彩539", "天天樂", "六合彩", "大樂透"].map((item) => <li key={item}>{item}</li>)}</ul>
      </LegalInfoSection>
      <LegalInfoSection title="五、使用方式">
        <p>使用者透過 LINE 或 Google 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p>
        <p>Matrix 天衡以同一期的兩個球位與對應號碼共同作為條件，比對歷史紀錄。可設定天衡期數、版路類型、天衡條件及進階選項，按下「開始天衡」後查看天衡結果、重複號碼統計及版路驗證過程。</p>
        <p>Matrix 天樞以同一期的三個球位與對應號碼共同作為條件，比對歷史紀錄。可設定天樞期數、版路類型、天樞條件及進階選項，按下「開始天樞」後查看天樞結果、重複號碼統計及版路驗證過程。</p>
        <p>不同會員狀態可使用的功能及權限，依目前帳號顯示為準。</p>
      </LegalInfoSection>
      <LegalInfoSection title="六、探索結果說明">
        <p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p>
      </LegalInfoSection>
      {subscriptionPurchaseVisible && <LegalInfoSection title="七、Matrix Pro 說明">
        <p>Matrix Pro 為樂彩 Matrix 的付費訂閱方案，提供月方案、季方案及年方案。</p>
        <p>實際方案價格、訂閱期間、功能權限及目前可使用內容，依「訂閱方案與收費標準」及帳號顯示為準。</p>
      </LegalInfoSection>}
    </LegalInfoDocument>
  );
}

export function RefundPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <LegalInfoDocument title="退款規範" onNavigate={onNavigate}>
      <LegalInfoSection title="一、適用範圍"><p>本退款規範適用於樂彩 Matrix 提供的 Matrix Pro 付費方案。</p></LegalInfoSection>
      <LegalInfoSection title="二、自動續訂"><p>自動續訂尚未開放，目前不會自動扣款或續訂。</p></LegalInfoSection>
      <LegalInfoSection title="三、七日解除權與數位服務"><p>Matrix Pro 為付款後，提供使用權限的數位服務。</p><p>退款與七日解除權依實際交易情形及相關法令辦理。</p></LegalInfoSection>
      <LegalInfoSection title="四、可申請退款情形"><DetailList items={["重複付款。", "付款成功但 Matrix Pro 權限未開通。", "因 樂彩 Matrix 系統異常，致已購買的主要服務無法使用。", "其他依法應辦理退款的情形。"]} /></LegalInfoSection>
      <LegalInfoSection title="五、不予退款情形"><DetailList items={["非屬本規範或法律規定應退款的情形。"]} /></LegalInfoSection>
      <LegalInfoSection title="六、退款申請方式"><p>請寄送電子郵件至 <a href="mailto:matrix.lottery@gmail.com">matrix.lottery@gmail.com</a>，並提供會員帳號、付款日期、付款金額、訂單或交易資料及退款原因。</p></LegalInfoSection>
      <LegalInfoSection title="七、退款處理"><p>收到申請後，將依付款紀錄、權限開通狀態及服務使用情形進行核對。</p><p>符合退款條件者，退款方式及實際入帳時間，將依原付款方式與金流服務商作業時間辦理。</p></LegalInfoSection>
      <LegalInfoSection title="八、其他"><p>本規範如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留退款申請資料核對、交易狀態確認及退款資格認定之權利；退款處理仍依中華民國相關法令及本退款規範辦理。</p></LegalInfoSection>
    </LegalInfoDocument>
  );
}

export function ContactSupportPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="聯絡客服/問題回報/商務合作" onNavigate={onNavigate} className="profile-info-screen contact-support-screen">
      <DetailCard title="聯絡客服">
        <div className="contact-support-row"><span className="contact-support-label">信箱：</span><a href="mailto:matrix.lottery@gmail.com">matrix.lottery@gmail.com</a></div>
        <div className="contact-support-row"><span className="contact-support-label">電話：</span><a href="tel:0912403517">0912-403-517</a></div>
      </DetailCard>
      <DetailCard title="問題回報"><div className="contact-support-row"><span className="contact-support-label">信箱：</span><a href="mailto:matrix.lottery@gmail.com">matrix.lottery@gmail.com</a></div></DetailCard>
      <DetailCard title="商務合作"><div className="contact-support-row"><span className="contact-support-label">信箱：</span><a href="mailto:matrix.lottery@gmail.com">matrix.lottery@gmail.com</a></div></DetailCard>
    </ProfileDetailShell>
  );
}

export function VersionInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="版本資訊/更新紀錄" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="目前版本"><p>0.1.0</p></DetailCard></ProfileDetailShell>;
}

export function MemberTermsPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const sections: Array<[string, React.ReactNode]> = [
    ["一、服務範圍", <p>樂彩 Matrix 提供 {subscriptionPurchaseVisible ? "Matrix 分析" : "Matrix 查詢"}、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。</p>],
    ["二、會員登入", <p>使用者透過 LINE 或 Google 登入後使用會員功能。</p>],
    ["三、Matrix Pro 訂閱", <p>Matrix Pro 提供月方案、季方案及年方案。</p>],
    ["四、訂閱方案", <><ul className="legal-info-plans">{[
      "月方案：30 天，NT$2,880",
      "季方案：90 天，NT$5,580",
      "年方案：365 天，NT$17,800",
    ].map((plan) => <li key={plan}>{plan}</li>)}</ul><p>以上價格，均為新臺幣含稅價格。</p></>],
    ["五、啟動碼", <><p>啟動碼用於增加 Matrix Pro 訂閱天數。</p><p>每組啟動碼只能成功使用一次。</p><p>啟動碼有效期限與訂閱期間分開計算。</p></>],
    ["六、服務內容", <p>不同會員狀態，可使用的功能及權限，依目前帳號顯示及系統判定為準。</p>],
    ["七、探索結果", <p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p>],
    ["八、退款", <p>退款申請及審核方式，依「退款規範」頁面公告內容辦理。</p>],
    ["九、個人資料", <p>會員資料的使用方式依「隱私權政策」頁面內容辦理。</p>],
    ["十、其他", <p>樂彩 Matrix 保留服務內容、功能權益、訂閱方案、活動內容、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。</p>],
  ];
  return <LegalInfoDocument title="會員服務條例" onNavigate={onNavigate}>{sections.filter(([title]) => subscriptionPurchaseVisible || ["一、服務範圍", "六、服務內容", "七、探索結果", "九、個人資料"].includes(title)).map(([title, content]) => <LegalInfoSection title={title} key={title}>{content}</LegalInfoSection>)}</LegalInfoDocument>;
}

export function PrivacyPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  return (
    <LegalInfoDocument title="隱私權政策" onNavigate={onNavigate}>
      <LegalInfoSection title="一、蒐集的資料"><DetailList items={["登入服務所提供的帳號識別資料", ...(subscriptionPurchaseVisible ? ["Matrix Pro 訂閱狀態", "訂閱到期日"] : []), "啟動碼使用紀錄", "推薦碼使用紀錄", "推薦成功人數", "通知設定"]} /></LegalInfoSection>
      <LegalInfoSection title="二、使用目的"><DetailList items={["會員登入與帳號識別", ...(subscriptionPurchaseVisible ? ["顯示會員及訂閱狀態", "Matrix Pro 啟用、續訂及權限管理"] : []), "提供使用者已選擇的功能", ...(subscriptionPurchaseVisible ? ["推薦活動資格與獎勵管理"] : []), "系統通知與服務通知"]} /></LegalInfoSection>
      <LegalInfoSection title="三、第三方服務"><p>目前使用 LINE 與 Google 登入服務。</p>{subscriptionPurchaseVisible && <p>使用綠界付款時，交易由綠界金流處理。</p>}</LegalInfoSection>
      <LegalInfoSection title="四、資料使用範圍"><p>蒐集之資料，僅用於本政策所載之使用目的及提供樂彩 Matrix 服務，不會於未經使用者同意或法律另有規定之情況下，提供予第三方。</p></LegalInfoSection>
      <LegalInfoSection title="五、資料安全"><p>樂彩 Matrix 將採取合理之安全措施保護會員資料，避免未經授權之存取、使用、修改或洩漏。</p></LegalInfoSection>
      <LegalInfoSection title="六、隱私權政策調整"><p>樂彩 Matrix 保留修改本隱私權政策之權利，更新後將公布於本頁面，並自公告日起生效。</p></LegalInfoSection>
    </LegalInfoDocument>
  );
}

export function DisclaimerPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  return (
    <LegalInfoDocument title="聲明與免責事項" onNavigate={onNavigate}>
      <LegalInfoSection title="一、服務性質"><p>樂彩 Matrix 提供公開的開獎資料查詢、歷史資料整理、比對、{subscriptionPurchaseVisible ? "計算及分析工具" : "計算及查詢工具"}。</p><p>本服務不提供任何中獎、獲利或特定結果之保證。</p></LegalInfoSection>
      <LegalInfoSection title="二、資訊用途"><p>服務內呈現的資料、{subscriptionPurchaseVisible ? "分析結果及探索結果僅供參考" : "查詢結果及探索結果僅供參考"}，不代表任何中獎、獲利或結果之保證。</p><p>使用者應自行判斷是否採用服務所提供的資訊。</p></LegalInfoSection>
      <LegalInfoSection title="三、使用者決定"><p>使用者應自行決定如何使用服務內提供的資料、{subscriptionPurchaseVisible ? "功能及分析結果" : "功能及查詢結果"}，並自行承擔相關決定所產生的結果。</p></LegalInfoSection>
      <LegalInfoSection title="四、資料差異"><p>如服務內資料與官方公布資料不同，請以官方公布資料為準。</p></LegalInfoSection>
      <LegalInfoSection title="五、系統與服務"><p>樂彩 Matrix 不保證服務持續不中斷、完全無錯誤，或所有功能於任何時間皆可正常使用。</p><p>如因系統維護、更新、網路異常、第三方服務或其他原因造成服務中斷、延遲或資料顯示異常，將依實際情況處理。</p></LegalInfoSection>
      <LegalInfoSection title="六、第三方服務"><p>本服務使用 LINE 與 Google 登入服務。</p>{subscriptionPurchaseVisible && <p>使用綠界付款時，交易由綠界金流處理。</p>}<p>第三方服務之使用方式、資料處理及服務狀態，依各第三方服務提供者之規定辦理。</p></LegalInfoSection>
      <LegalInfoSection title="七、責任範圍"><p>因使用或無法使用樂彩 Matrix 所提供的資料、{subscriptionPurchaseVisible ? "功能、分析結果或第三方服務" : "功能、查詢結果或第三方服務"}所產生的影響，應依實際情況及相關法令認定。</p></LegalInfoSection>
      <LegalInfoSection title="八、內容調整"><p>樂彩 Matrix 得依服務實際運作需要調整功能、內容及相關說明。</p><p>如涉及會員權益或重要內容調整，將於服務內公告。</p></LegalInfoSection>
      <LegalInfoSection title="九、最終說明"><p>本聲明與免責事項如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留服務內容、功能說明、資料呈現、規則內容、修改、解釋及最終決定之權利。</p></LegalInfoSection>
    </LegalInfoDocument>
  );
}
