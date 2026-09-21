import { useEffect, useRef } from 'react';
import { hasLineOAuthCallback } from '../auth/line-pwa-return';
import { useAppDialog } from '../dialog/AppDialog';
import { SubscriptionCopy } from '../subscription-copy';
import { usePermissionSettings } from '../permission-settings';
import { useSubscriptionPurchaseVisible } from '../subscription-purchase-visibility';
import type { Navigate } from '../features/navigation';

export const FIRST_VISIT_GUIDE_SEEN_KEY = 'matrix-first-visit-guide-seen';

export function FirstVisitGuide({ enabled, onNavigate }: { enabled: boolean; onNavigate: Navigate }) {
  const { confirm } = useAppDialog();
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const registeredMemberFreeAccess = usePermissionSettings()?.registeredMemberFreeAccess === true;
  const shown = useRef(false);
  const navigate = useRef(onNavigate);

  useEffect(() => { navigate.current = onNavigate; }, [onNavigate]);

  useEffect(() => {
    if (!enabled || shown.current || window.location.pathname !== '/' || hasLineOAuthCallback()) return;
    let active = true;

    // Wait for effect replay to settle before opening the shared dialog.
    queueMicrotask(() => {
      if (!active || shown.current) return;
      try {
        if (window.localStorage.getItem(FIRST_VISIT_GUIDE_SEEN_KEY)) return;
      } catch {
        // The in-memory guard still prevents repeats when storage is unavailable.
      }
      shown.current = true;
      try { window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1'); } catch { /* Optional persistence. */ }

      void confirm({
        variant: 'registration-guide',
        title: registeredMemberFreeAccess
          ? '免費註冊會員'
          : <SubscriptionCopy formal="真正的「版路分析」工具" alternative="使用教學" />,
        description: registeredMemberFreeAccess
          ? '使用 LINE 或 Google 登入後目前可免費使用 Matrix 探索十三期與完整範圍、天衡、天樞、天衍及天工；Matrix 狀態進階資訊仍依訂閱權限開放。'
          : subscriptionPurchaseVisible
            ? <>
                點擊下方「我的」，選擇使用 LINE 或 Google 登入。
                <br />
                -
                <br />
                點擊首頁下方的 Matrix Core，即可開始探索各種類型的版路。
              </>
            : 'Matrix 探索二期基本查詢可直接使用；天衡、較高期數、完整範圍、天衍與天工請先使用 LINE 或 Google 登入。新註冊 LINE 會員另有天衍 2 天、天工 1 天試用。',
        confirmLabel: registeredMemberFreeAccess
          ? '免費註冊'
          : <SubscriptionCopy formal="免費註冊" alternative="開始使用" />,
        cancelLabel: '知道了',
      }).then((confirmed) => {
        if (active && confirmed && (subscriptionPurchaseVisible || registeredMemberFreeAccess)) navigate.current('profile');
      });
    });

    return () => { active = false; };
  }, [confirm, enabled, registeredMemberFreeAccess, subscriptionPurchaseVisible]);

  return null;
}
