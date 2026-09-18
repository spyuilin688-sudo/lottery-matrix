import { useEffect, useRef } from 'react';
import { hasLineOAuthCallback } from '../auth/line-pwa-return';
import { useAppDialog } from '../dialog/AppDialog';
import { SubscriptionCopy } from '../subscription-copy';
import { useSubscriptionPurchaseVisible } from '../subscription-purchase-visibility';
import type { Navigate } from '../features/navigation';

export const FIRST_VISIT_GUIDE_SEEN_KEY = 'matrix-first-visit-guide-seen';

export function FirstVisitGuide({ enabled, onNavigate }: { enabled: boolean; onNavigate: Navigate }) {
  const { confirm } = useAppDialog();
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
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
        title: <SubscriptionCopy formal="免費註冊會員" alternative="使用教學" />,
        description: <SubscriptionCopy
          formal="點擊下方「我的」，可使用 LINE 或 Google 登入。新註冊 LINE 會員可使用 Pro 演算法：天衍 2 天、天工 1 天。點擊首頁下方的 Matrix Core，即可進入探索。"
          alternative="Matrix 探索二期基本查詢可直接使用；天衡、較高期數、完整範圍、天衍與天工請先使用 LINE 或 Google 登入。新註冊 LINE 會員另有天衍 2 天、天工 1 天試用。"
        />,
        confirmLabel: <SubscriptionCopy formal="免費註冊" alternative="開始使用" />,
        cancelLabel: '知道了',
      }).then((confirmed) => {
        if (active && confirmed && subscriptionPurchaseVisible) navigate.current('profile');
      });
    });

    return () => { active = false; };
  }, [confirm, enabled, subscriptionPurchaseVisible]);

  return null;
}