import { useId, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import type { Session } from "@supabase/supabase-js";
import { isActivationRedemptionError, redeemActivationCode, type ActivationRedemptionErrorCode } from "../activation/redeemActivationCode";
import { bootstrapMember, fetchMemberPaymentHistory, fetchMemberProfile, fetchMemberReferralSummary, fetchPendingTransferRequest, submitMemberReferralCode, submitTransferRequest, type MemberPaymentHistoryItem, type MemberProfileResponse, type MemberReferralSummary, type MemberTransferRequest, type ManualTransferPlanCode } from "../member-api";
import { readManualTransferPlan, saveManualTransferPlan } from "../manual-transfer-selection";
import { reconcilePendingLineLogoutPresence, signInWithLine, signOutFromMatrix } from "../auth/line-auth";
import { clearLineLoginAttempt, consumeLineLoginAttempt, markLineLoginAttempt } from "../auth/line-login-attempt";
import { withDeadline } from "../lib/api-resilience";
import { getSupabaseClient } from "../lib/supabase";
import { logicalSessionIdentity } from "../auth/session-identity";
import { useAppDialog } from "../dialog/AppDialog";
import { usePwaLifecycle } from "../pwa-lifecycle";
import { useSubscriptionPurchaseVisible } from "../subscription-purchase-visibility";
import { Navigate, ScreenId } from "./navigation";
import { FeatureShell, SectionTitle } from "./shared";


/** Keep the approved raster artwork intact; mask sample text and the sample photo.
 *  All visible member data and interactive labels are rendered by ProfilePage.
 */
function MembershipArtwork({ showSubscription }: { showSubscription: boolean }) {
  const maskId = useId();
  const headingClipId = `${maskId}-heading`;
  const informationClipId = `${maskId}-information`;
  const source = "/assets/lottery/membership/membership-ab-reference.png";
  return (
    <div className="membership-reference-art" data-subscription-visible={showSubscription} aria-hidden="true">
      <svg viewBox={showSubscription ? "0 0 1563 740" : "0 0 1563 387"} preserveAspectRatio="none" focusable="false">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1563" height="1006">
            <rect width="1563" height="1006" fill="white" />
            <circle cx="225" cy="216" r="111" fill="black" />
            <rect x="388" y="132" width="490" height="81" fill="black" />
            <rect x="388" y="235" width="516" height="57" fill="black" />
            <rect x="1280" y="180" width="145" height="67" fill="black" />
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
            <rect x="800" y="534" width="39" height="196" />
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
  const metadata = (user as { user_metadata?: unknown }).user_metadata;
  if (metadata && typeof metadata === "object") {
    const name = (metadata as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
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
  const name = (identityData as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export type ProfileAuthState =
  | "initializing"
  | "anonymous"
  | "signing-in"
  | "authenticated"
  | "signing-out"
  | "degraded";

export const PROFILE_SESSION_TIMEOUT_MS = 2_500;

export function ProfilePage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const { confirm: confirmDialog, alert: alertDialog } = useAppDialog();
  const { showInstallAction, requestInstall } = usePwaLifecycle();
  const [authState, setAuthState] = useState<ProfileAuthState>("initializing");
  const [authRetrying, setAuthRetrying] = useState(false);
  const [authCheckRevision, setAuthCheckRevision] = useState(0);
  const lineLoginInProgress = useRef(false);
  const [lineAvatarUrl, setLineAvatarUrl] = useState<string | null>(null);
  const [lineNickname, setLineNickname] = useState<string | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberProfileResponse | null>(null);
  useEffect(() => {
    let active = true;
    let authRevision = 0;
    let initialReadSettled = false;
    let initialReadFailed = false;
    const client = getSupabaseClient();
    const applySession = (session: unknown) => {
      if (!active) return;
      // Supabase can broadcast the callback session before the PWA handoff is
      // acknowledged. Keep the login button pending until this attempt settles.
      if (session && lineLoginInProgress.current) return;
      setAuthRetrying(false);
      setAuthState(session ? "authenticated" : "anonymous");
      setLineAvatarUrl(lineAvatarFromSession(session));
      setLineNickname(lineNicknameFromSession(session));
      if (consumeLineLoginAttempt({ hasSession: Boolean(session) })) {
        void alertDialog({ title: "登入成功", tone: "success" });
      }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" && !session && (!initialReadSettled || initialReadFailed)) return;
      authRevision += 1;
      if (event === "SIGNED_OUT") {
        reconcilePendingLineLogoutPresence(null);
        applySession(null);
        return;
      }
      reconcilePendingLineLogoutPresence(session);
      applySession(session);
    });
    const initialRevision = authRevision;
    void withDeadline(() => client.auth.getSession(), { timeoutMs: PROFILE_SESSION_TIMEOUT_MS }).then(({ data, error }) => {
      initialReadSettled = true;
      if (!active || authRevision !== initialRevision) return;
      if (error) {
        reconcilePendingLineLogoutPresence(undefined);
        setAuthRetrying(false);
        initialReadFailed = true;
        consumeLineLoginAttempt({ hasSession: false });
        setAuthState("degraded");
        return;
      }
      reconcilePendingLineLogoutPresence(data.session);
      applySession(data.session);
    }).catch(() => {
      initialReadSettled = true;
      if (active && authRevision === initialRevision) {
        initialReadFailed = true;
        consumeLineLoginAttempt({ hasSession: false });
        reconcilePendingLineLogoutPresence(undefined);
        setAuthRetrying(false);
        setAuthState("degraded");
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [alertDialog, authCheckRevision]);
  useEffect(() => {
    if (authState !== "authenticated") {
      if (authState === "anonymous" || authState === "degraded") setMemberProfile(null);
      return;
    }
    let active = true;
    void bootstrapMember().then(() => fetchMemberProfile()).then((profile) => {
      if (active) setMemberProfile(profile);
    }).catch(() => {
      if (active) setMemberProfile(null);
    });
    return () => { active = false; };
  }, [authState]);
  const expiry = memberProfile?.isLifetime ? null : memberExpiryInTaipei(memberProfile?.planExpiresAt ?? null);
  const displayedPlanName = memberProfile ? memberProfile.planName ?? "免費會員" : "";
  const displayedPlanDescription = displayedPlanName === "免費會員" ? "核心功能體驗" : "享有所有 Matrix Pro 功能";
  const handleAuthAction = async () => {
    if (authRetrying || authState === "initializing" || authState === "signing-in" || authState === "signing-out") return;
    if (authState === "degraded") {
      setAuthRetrying(true);
      setAuthCheckRevision((revision) => revision + 1);
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
        setLineNickname(null);
        await alertDialog({ title: "已登出", tone: "success" });
      } else {
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
          const { data, error: sessionError } = await withDeadline(
            () => getSupabaseClient().auth.getSession(), { timeoutMs: PROFILE_SESSION_TIMEOUT_MS },
          );
          if (sessionError) throw sessionError;
          if (data.session) {
            setAuthState('authenticated');
            setLineAvatarUrl(lineAvatarFromSession(data.session));
            setLineNickname(lineNicknameFromSession(data.session));
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
      setAuthState((current) => current === "signing-in" ? "anonymous" : current);
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
    { title: "系統相關", items: [["版本資訊/更新紀錄", "version-info"]] },
    { title: "客服與支援", items: [["聯絡客服/問題回報/商務合作", "merchant-info"]] },
  ];
  const visibleMenuGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items.filter(([, screen]) => subscriptionPurchaseVisible
      || (screen !== "payment-history" && screen !== "refund-policy")),
  })).filter((group) => group.items.length > 0);

  return (
    <FeatureShell title="我的" onNavigate={onNavigate} active="我的" className="profile-screen" compactHeader headerArtwork="/assets/lottery/functions/我的標題K.png">
      <div className="membership-card-stack">
        <MembershipArtwork showSubscription={subscriptionPurchaseVisible} />
        <section className="panel membership-card profile-card">
          <div className="profile-avatar">
            <img
              src={lineAvatarUrl ?? "/assets/lottery/matrix-profile-avatar.jpg"}
              alt={lineAvatarUrl ? "LINE 頭貼" : "Matrix 預設頭貼"}
            />
          </div>
          <div className="profile-copy">
            <h2>樂彩玩家</h2>
            <p
              className="profile-nickname"
              data-name-fit={lineNickname && Array.from(lineNickname).length > 12 ? "compact" : "regular"}
            >LINE 暱稱：{lineNickname ?? ""}</p>
          </div>
          {authState !== "initializing" ? <button
            type="button"
            className="profile-logout"
            data-auth-state={authState}
            onClick={() => void handleAuthAction()}
            disabled={authRetrying || authState === "signing-in" || authState === "signing-out"}
            aria-busy={authRetrying || authState === "signing-in" || authState === "signing-out"}
          ><span>{
            authState === "authenticated" ? "登出"
              : authState === "signing-in" ? "登入中…"
                : authState === "signing-out" ? "登出中…"
                  : authState === "degraded" ? "重新檢查"
                    : "LINE 登入"
          }</span></button> : null}
        </section>
        {subscriptionPurchaseVisible && <section className="panel membership-card subscription-status-card">
          <SectionTitle>目前訂閱狀態</SectionTitle>
          <div className="subscription-status-content">
            <div className="subscription-plan"><span>目前方案</span><strong>{displayedPlanName}</strong><p>{memberProfile ? displayedPlanDescription : ""}</p></div>
            <div className="subscription-expiry"><span>訂閱到期日</span><strong>{expiry?.date ?? ""}</strong><p>{expiry ? `剩餘 ${expiry.remainingDays} 天` : ""}</p></div>
          </div>
          <button type="button" className="subscription-entry" onClick={() => onNavigate("pro-plans")}>
            <span>訂閱方案／收費標準</span><ChevronRightIcon />
          </button>
        </section>}
      </div>
      {visibleMenuGroups.map((group) => (
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

export function ProfileDetailShell({ title, children, onNavigate, className = "", hidePageTitle = false, headerArtwork = "/assets/lottery/functions/我的標題K2.png" }: { title: string; children?: React.ReactNode; onNavigate: Navigate; className?: string; hidePageTitle?: boolean; headerArtwork?: string }) {
  return (
    <FeatureShell title={title} onNavigate={onNavigate} active="我的" backTarget="profile" compactHeader className={`profile-detail-screen ${className}`.trim()} hidePageTitle={hidePageTitle} headerArtwork={headerArtwork}>
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
    <ProfileDetailShell title={title} onNavigate={onNavigate} className="profile-info-screen" headerArtwork="/assets/lottery/functions/法律資訊標題K.png">
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

function useSubscriptionProfile() {
  const [profile, setProfile] = useState<MemberProfileResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchMemberProfile().then((value) => {
      if (!cancelled) setProfile(value);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, []);
  return { profile, error };
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
  refunded: "已退款",
  chargeback: "已刷退",
  cancelled: "交易已取消",
} as const;

export function PaymentHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  const [history, setHistory] = useState<MemberPaymentHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const loadPaymentHistory = () => {
    setHistory(null);
    setHistoryError(false);
    void fetchMemberPaymentHistory().then(setHistory).catch(() => setHistoryError(true));
  };
  useEffect(() => {
    loadPaymentHistory();
  }, []);
  return (
    <ProfileDetailShell title="付款紀錄" onNavigate={onNavigate} className="payment-history-screen">
      <DetailCard title="付款紀錄">
        {historyError ? <div role="alert"><span>付款紀錄載入失敗</span><button type="button" aria-label="重新載入付款紀錄" onClick={loadPaymentHistory}>重新載入</button></div> : history === null ? <p role="status">付款紀錄載入中</p> : history.length === 0 ? <p>目前沒有付款紀錄。</p> : (
          <div className="payment-history-list">
            {history.map((item) => (
              <article className="payment-history-item" key={item.id}>
                <strong>{item.planName}</strong>
                <span>{`NT$${item.amount.toLocaleString("en-US")}`}</span>
                <time>{new Date(item.submittedAt).toLocaleString("zh-TW")}</time>
                <b data-status={item.status}>{paymentStatusLabels[item.status]}</b>
              </article>
            ))}
          </div>
        )}
      </DetailCard>
    </ProfileDetailShell>
  );
}

export function ProPlansPage({ onNavigate }: { onNavigate: Navigate }) {
  const appDialog = useAppDialog();
  const { profile: renewalProfile, error: renewalProfileError } = useSubscriptionProfile();
  const plans = [
    { code: "month", name: "月費方案", price: "$2,880", days: 30, icons: [], features: ["Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"] },
    { code: "quarter", name: "季費方案", price: "$5,580", days: 90, icons: [{ src: "/assets/matrix-explore/tianyan.jpg", alt: "天衍" }], features: ["Matrix 天衍 - 使用權限", "Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"] },
    { code: "year", name: "年費方案", price: "$17,800", days: 365, icons: [{ src: "/assets/matrix-explore/tianyan.jpg", alt: "天衍" }, { src: "/assets/matrix-explore/tiangong.jpg", alt: "天工" }], features: ["Matrix 天衍 - 使用權限", "Matrix 天工 - 使用權限", "Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"] },
  ] as const;
  const carouselPlans = [plans[2], ...plans, plans[0]] as const;
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const selected = plans[selectedPlan];
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
    const renewedAt = Math.max(Date.now(), expiry) + selected.days * 86_400_000;
    return memberExpiryInTaipei(new Date(renewedAt).toISOString())?.date ?? "暫時無法計算";
  }, [selected.days, renewalProfile, renewalProfileError]);
  const handlePayment = async () => {
    if (!await appDialog.confirm({ title: `確認以${selected.name}進行付款？`, confirmLabel: "確認付款" })) return;
    saveManualTransferPlan(selected.code);
    onNavigate("manual-transfer");
  };
  return (
    <ProfileDetailShell title="Matrix Pro 訂閱方案與收費標準" onNavigate={onNavigate} className="pro-plans-screen" headerArtwork="/assets/lottery/functions/訂閱方案標題K.png">
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
          <p className="auto-renew-note">手動轉帳不會自動扣款；金流 API 上線後再提供自動續訂。</p>
        </section>
        <button type="button" className="confirm-payment primary-action branded-explore-action" onClick={handlePayment}><span>確定付款</span></button>
        <p className="payment-note">點擊 確定付款 將跳轉付款頁面</p>
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
  const planCode = readManualTransferPlan();
  const plan = planCode ? manualTransferPlans[planCode] : null;
  const [lastFive, setLastFive] = useState("");
  const [pending, setPending] = useState<MemberTransferRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(plan));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) {
      onNavigate("pro-plans");
      return;
    }
    void fetchPendingTransferRequest()
      .then(setPending)
      .catch(() => setError("無法讀取轉帳申請，請稍後再試。"))
      .finally(() => setLoading(false));
  }, [onNavigate, plan]);

  if (!plan || !planCode) return null;

  const submit = async () => {
    if (lastFive.length !== 5 || submitting || pending) return;
    setSubmitting(true);
    setError(null);
    try {
      setPending(await submitTransferRequest(planCode, lastFive));
    } catch (cause) {
      const message = String((cause as { message?: unknown })?.message ?? cause);
      if (message.includes("PENDING_TRANSFER_EXISTS")) {
        setPending(await fetchPendingTransferRequest());
      } else {
        setError("提交失敗，請稍後再試。 ");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProfileDetailShell title="銀行轉帳付款" onNavigate={onNavigate} className="manual-transfer-screen">
      <section className="panel detail-card manual-transfer-summary">
        <h2>付款方案</h2>
        <dl>
          <div><dt>方案</dt><dd>{plan.name}</dd></div>
          <div><dt>金額</dt><dd>{`NT$${plan.amount.toLocaleString("en-US")}`}</dd></div>
        </dl>
      </section>
      <section className="panel detail-card manual-transfer-bank-card">
        <h2>轉帳資料</h2>
        <dl>
          <div><dt>銀行</dt><dd>連線銀行</dd></div>
          <div><dt>銀行代碼</dt><dd>824</dd></div>
          <div className="manual-transfer-bank-row"><dt>帳號</dt><dd className="manual-transfer-account">111023004501</dd><button type="button" className="manual-transfer-copy" onClick={() => void navigator.clipboard.writeText("111023004501")}>複製帳號</button></div>
          <div><dt>戶名</dt><dd>黎小姐</dd></div>
        </dl>
      </section>
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
          disabled={Boolean(pending)}
        />
        {loading ? <p role="status">申請狀態載入中</p> : null}
        {pending ? <p className="manual-transfer-pending"><strong>{pending.status === "pending" ? "待確認" : transferStatusLabels[pending.status]}</strong><span>已有待確認申請</span></p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <button type="button" className="confirm-payment manual-transfer-submit" disabled={loading || submitting || Boolean(pending) || lastFive.length !== 5} onClick={() => void submit()}>{submitting ? "提交中" : "提交"}</button>
      </section>
    </ProfileDetailShell>
  );
}

export function AboutMatrixPage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  return <ProfileDetailShell title="關於 樂彩 Matrix" onNavigate={onNavigate} className="profile-info-screen" headerArtwork="/assets/lottery/functions/法律資訊標題K.png"><section className="panel detail-card about-matrix-card"><p className="about-welcome">歡迎使用 樂彩 Matrix。</p><p>樂彩 Matrix 致力於提供清晰、{subscriptionPurchaseVisible ? "直覺且易於使用的開獎資料查詢與分析服務" : "直覺且易於使用的開獎資料查詢"}，協助使用者快速查閱公開資訊、整理歷史數據，並透過多項分析功能，提升資料檢視效率。</p><p>我們持續優化介面設計與操作體驗，{subscriptionPurchaseVisible ? "整合各項分析工具" : "整合各項查詢工具"}，讓不同需求的使用者都能以更簡單、更流暢的方式使用各項功能。</p><h2>我們的理念</h2><p>我們重視資料整理、操作效率與使用體驗，持續改善介面細節與功能品質，希望提供穩定、{subscriptionPurchaseVisible ? "且容易使用的分析工具" : "且容易使用的查詢工具"}，讓每一次資料查詢都更加便利。</p><p className="about-thanks">感謝您對 樂彩 Matrix 的支持與使用！</p><div className="about-brand-info"><p><span>品牌名稱：</span>樂彩 Matrix</p><p>Copyright © 2026 樂彩 Matrix. All Rights Reserved.</p></div></section></ProfileDetailShell>;
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
  LINE_IDENTITY_REQUIRED: "請先以 LINE 登入後再輸入推薦碼",
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
    let authRevision = 0;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let currentIdentity: string | null | undefined;
    const client = getSupabaseClient();
    const applySession = (session: Session | null) => {
      const identity = logicalSessionIdentity(session);
      if (currentIdentity === identity) return;
      currentIdentity = identity;
      const revision = ++authRevision;
      clearTimeout(loadTimer);
      referralRequestRevision.current += 1;
      setReferralSummary(null);
      setReferralCode("");
      setReferralSubmitting(false);
      setReferralResultState("idle");
      setReferralLoginRequired(!session);
      setReferralLoading(Boolean(session));
      if (!session) return;
      // Defer API work until Supabase releases its auth-event lock.
      loadTimer = setTimeout(() => {
        void fetchMemberReferralSummary().then((summary) => {
          if (active && authRevision === revision) setReferralSummary(summary);
        }).catch((error: unknown) => {
          if (!active || authRevision !== revision) return;
          const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
          setReferralLoginRequired(["MEMBER_SESSION_EXPIRED", "AUTH_REQUIRED", "LINE_IDENTITY_REQUIRED"].includes(message));
        }).finally(() => {
          if (active && authRevision === revision) setReferralLoading(false);
        });
      }, 0);
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active || event === "INITIAL_SESSION") return;
      applySession(event === "SIGNED_OUT" ? null : session);
    });
    const initialRevision = authRevision;
    void withDeadline(() => client.auth.getSession(), { timeoutMs: PROFILE_SESSION_TIMEOUT_MS }).then(({ data, error }) => {
      if (!active || authRevision !== initialRevision) return;
      if (error) throw error;
      applySession(data.session);
    }).catch(() => {
      if (active && authRevision === initialRevision) setReferralLoading(false);
    });
    return () => {
      active = false;
      clearTimeout(loadTimer);
      subscription.unsubscribe();
      referralRequestRevision.current += 1;
    };
  }, []);

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
    if (submitting) return;

    setSubmitting(true);
    const confirmed = await confirmDialog({
      title: "確認使用啟動碼？",
      confirmLabel: "確認",
      cancelLabel: "取消",
    });
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
    <ProfileDetailShell title="我的推薦碼/啟動碼" onNavigate={onNavigate} className="activation-code-screen" hidePageTitle headerArtwork="/assets/lottery/functions/推薦啟動標題K.png">
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
          {referralLoginRequired && <p className="activation-result" role="status">請先以 LINE 登入</p>}
          {!referralLoading && !referralLoginRequired && referralSummary === null && <p className="activation-result error" role="alert">推薦碼資訊暫時無法讀取，請稍後再試</p>}
        </div>
        <CollapsibleRuleCard title="推薦成功認定" open={openRules.recognition} onToggle={() => toggleRule("recognition")}><DetailList items={["每個 LINE 帳號，僅能輸入一次推薦碼。", ...(subscriptionPurchaseVisible ? ["輸入推薦碼的帳號，完成訂閱 Matrix Pro 月方案、季方案或年方案任一方案後，該筆推薦即計為「推薦成功」。", "若該筆訂閱後續發生退款、刷退或交易取消，該筆推薦成功將失效，推薦成功人數同步扣除，相關獎勵資格，將依最新推薦成功人數重新計算。"] : [])]} /></CollapsibleRuleCard>
        <CollapsibleRuleCard title="推薦成功獎勵" open={openRules.reward} onToggle={() => toggleRule("reward")}><DetailList items={["推薦成功滿 10 人：Matrix 探索期數 (七期) 開放日：每週二、五開放變為每週一、二、四、五。", "推薦成功滿 15 人：Matrix 探索期數 (七期)：永久開放。", "推薦成功滿 30 人：Matrix 探索範圍 (完整範圍)：由不開放變為每週二、五開放。", "推薦成功滿 50 人：Matrix 探索範圍 (完整範圍)：永久開放。"]} /></CollapsibleRuleCard>
        {subscriptionPurchaseVisible && <CollapsibleRuleCard title="推薦獎勵補充規則" open={openRules.supplement} onToggle={() => toggleRule("supplement")}><DetailList items={["推薦獎勵不需本人訂閱 Matrix Pro。", "當達成對應的推薦成功人數門檻後，即可使用已解鎖的 Matrix 探索權限。", "若因退款、刷退或交易取消等情況，導致推薦成功人數低於原獎勵門檻：已取得的對應獎勵將同步取消。並依最新的推薦成功人數，重新計算資格與獎勵。", "樂彩 Matrix 保留活動內容、參加資格、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。"]} /></CollapsibleRuleCard>}
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
              }} aria-label="啟動碼" />
              <button type="button" className="primary-action branded-explore-action" onClick={handleActivation} disabled={submitting}><span>確認</span></button>
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
  const [summary, setSummary] = useState<MemberReferralSummary | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const requestRevision = useRef(0);
  const loadReferralSummary = async () => {
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    setLoadState("loading");
    try {
      const nextSummary = await fetchMemberReferralSummary();
      if (revision !== requestRevision.current) return;
      setSummary(nextSummary);
      setLoadState("ready");
    } catch {
      if (revision !== requestRevision.current) return;
      setSummary(null);
      setLoadState("error");
    }
  };
  useEffect(() => {
    void loadReferralSummary();
    return () => { requestRevision.current += 1; };
  }, []);
  const copyReferralCode = async () => {
    if (!summary?.referralCode) return;
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
              <li>Matrix 天衍</li>
              <li>Matrix 天工</li>
            </ul>
          </li>
          {["Matrix 狀態", "Matrix 同星", "號碼對照單", "連碰立柱計算機", "Matrix 牌單", "Matrix 指南", "歷史開獎號碼", "Matrix 筆記本"].map((item) => <li key={item}>{item}</li>)}
        </ul>
      </LegalInfoSection>
      <LegalInfoSection title="四、支援彩種">
        <ul className="legal-info-lotteries">{["今彩539", "天天樂", "六合彩", "大樂透"].map((item) => <li key={item}>{item}</li>)}</ul>
      </LegalInfoSection>
      <LegalInfoSection title="五、使用方式">
        <p>使用者透過 LINE 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p>
        <p>不同會員狀態可使用的功能及權限，依目前帳號顯示為準。</p>
      </LegalInfoSection>
      <LegalInfoSection title="六、探索結果說明">
        <p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p>
      </LegalInfoSection>
      {subscriptionPurchaseVisible && <LegalInfoSection title="七、Matrix Pro 說明">
        <p>Matrix Pro 為樂彩 Matrix 的付費訂閱方案，提供月方案、季方案及年方案。</p>
        <p>使用者可自行選擇是否開啟自動續訂。</p>
        <p>實際方案價格、訂閱期間、功能權限及目前可使用內容，依「Matrix Pro 訂閱方案與收費標準」及帳號顯示為準。</p>
      </LegalInfoSection>}
    </LegalInfoDocument>
  );
}

export function RefundPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <LegalInfoDocument title="退款規範" onNavigate={onNavigate}>
      <LegalInfoSection title="一、適用範圍"><p>本退款規範適用於樂彩 Matrix 提供的 Matrix Pro 付費方案。</p><p>Matrix Pro 提供單次訂閱及自動續訂方式，實際付款方式，依使用者訂閱時的選擇為準。</p></LegalInfoSection>
      <LegalInfoSection title="二、自動續訂"><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前訂閱方案到期時，依原訂閱方案及續訂當時顯示的價格自動扣款，並延長相對應的 Matrix Pro 訂閱期間。</p><p>使用者可於下一次扣款前，先行關閉自動續訂。關閉自動續訂後，已付款的訂閱期間仍可使用至到期日，期滿後不再自動扣款或續訂。</p><p>關閉自動續訂僅停止下一期扣款，不等同取消目前訂閱或申請退款。</p><p>自動續訂扣款成功後，視為一筆新的 Matrix Pro 訂閱交易；如需申請退款，依本退款規範辦理。</p></LegalInfoSection>
      <LegalInfoSection title="三、七日解除權與數位服務"><p>Matrix Pro 為付款後，提供使用權限的數位服務。</p><p>若付款流程已事先告知，並取得使用者同意立即提供數位內容或線上服務，且服務已開始提供，依法得排除七日解除權，不適用七日無條件解除。</p></LegalInfoSection>
      <LegalInfoSection title="四、可申請退款情形"><DetailList items={["重複付款。", "付款成功但 Matrix Pro 權限未開通。", "因 樂彩 Matrix 系統異常，致已購買的主要服務無法使用。", "其他依法應辦理退款的情形。"]} /></LegalInfoSection>
      <LegalInfoSection title="五、不予退款情形"><DetailList items={["使用者已事先同意立即提供數位服務，且 Matrix Pro 權限已開通並開始使用，依法得排除七日解除權的情形。", "非屬本規範或法律規定應退款的情形。", "關閉自動續訂僅停止下一期扣款，不溯及已完成的當期訂閱交易。"]} /></LegalInfoSection>
      <LegalInfoSection title="六、退款申請方式"><p>請寄送電子郵件至 <a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a>，並提供會員帳號、付款日期、付款金額、訂單或交易資料及退款原因。</p></LegalInfoSection>
      <LegalInfoSection title="七、退款處理"><p>收到申請後，將依付款紀錄、權限開通狀態及服務使用情形進行核對。</p><p>符合退款條件者，退款方式及實際入帳時間，將依原付款方式與金流服務商作業時間辦理。</p></LegalInfoSection>
      <LegalInfoSection title="八、其他"><p>本規範如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留退款申請資料核對、交易狀態確認及退款資格認定之權利；退款處理仍依中華民國相關法令及本退款規範辦理。</p></LegalInfoSection>
    </LegalInfoDocument>
  );
}

export function ContactSupportPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="聯絡客服/問題回報/商務合作" onNavigate={onNavigate} className="profile-info-screen contact-support-screen">
      <DetailCard title="聯絡客服"><div className="contact-support-row"><span className="contact-support-label">信箱：</span><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></div></DetailCard>
      <DetailCard title="問題回報"><div className="contact-support-row"><span className="contact-support-label">信箱：</span><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></div></DetailCard>
      <DetailCard title="商務合作"><div className="contact-support-row"><span className="contact-support-label">信箱：</span><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></div></DetailCard>
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
    ["二、會員登入", <p>使用者透過 LINE 登入後使用會員功能。</p>],
    ["三、Matrix Pro 訂閱", <><p>Matrix Pro 提供月方案、季方案及年方案。</p><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前方案到期時，依原訂閱方案自動續訂並扣款。</p><p>使用者可於方案到期前，先行關閉自動續訂；關閉之後，已付款的 Matrix Pro 仍可使用至到期日，期滿後不再自動續訂。</p></>],
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
      <LegalInfoSection title="一、蒐集的資料"><DetailList items={["登入 LINE 所提供的帳號識別資料", ...(subscriptionPurchaseVisible ? ["Matrix Pro 訂閱狀態", "訂閱到期日"] : []), "啟動碼使用紀錄", "推薦碼使用紀錄", "推薦成功人數", "通知設定"]} /></LegalInfoSection>
      <LegalInfoSection title="二、使用目的"><DetailList items={["會員登入與帳號識別", ...(subscriptionPurchaseVisible ? ["顯示會員及訂閱狀態", "Matrix Pro 啟用、續訂及權限管理"] : []), "提供使用者已選擇的功能", ...(subscriptionPurchaseVisible ? ["推薦活動資格與獎勵管理"] : []), "系統通知與服務通知"]} /></LegalInfoSection>
      <LegalInfoSection title="三、第三方服務"><p>目前已確認使用 LINE 登入。</p></LegalInfoSection>
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
      <LegalInfoSection title="六、第三方服務"><p>本服務使用 LINE 登入、金流服務或其他第三方服務。</p><p>第三方服務之使用方式、資料處理及服務狀態，依各第三方服務提供者之規定辦理。</p></LegalInfoSection>
      <LegalInfoSection title="七、責任範圍"><p>因使用或無法使用樂彩 Matrix 所提供的資料、{subscriptionPurchaseVisible ? "功能、分析結果或第三方服務" : "功能、查詢結果或第三方服務"}所產生的影響，應依實際情況及相關法令認定。</p></LegalInfoSection>
      <LegalInfoSection title="八、內容調整"><p>樂彩 Matrix 得依服務實際運作需要調整功能、內容及相關說明。</p><p>如涉及會員權益或重要內容調整，將於服務內公告。</p></LegalInfoSection>
      <LegalInfoSection title="九、最終說明"><p>本聲明與免責事項如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留服務內容、功能說明、資料呈現、規則內容、修改、解釋及最終決定之權利。</p></LegalInfoSection>
    </LegalInfoDocument>
  );
}
