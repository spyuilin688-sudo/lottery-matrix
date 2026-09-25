import { useEffect, useRef } from 'react';
import { hasLineOAuthCallback } from '../auth/line-pwa-return';
import { useAppDialog } from '../dialog/AppDialog';
import type { Navigate } from '../features/navigation';

export const FIRST_VISIT_GUIDE_SEEN_KEY = 'matrix-first-visit-consent-v1';

export function FirstVisitGuide({ enabled }: { enabled: boolean; onNavigate: Navigate }) {
  const { confirm } = useAppDialog();
  const shown = useRef(false);

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

      void confirm({
        variant: 'first-visit-consent',
        title: '【使用者授權條款與免責聲明】',
        description: <>
          <span className="first-visit-consent-paragraph">歡迎使用 Matrix 數據分析系統。</span>
          <span className="first-visit-consent-paragraph">本系統是一款專為數字愛好者設計的「歷史規律統計與機率推演工具」。本系統所呈現之所有數據、歷史走勢及運算結果，均基於公開之歷史大數據進行邏輯排列，僅供統計學術研究與數字規律探討參考，不代表任何形式的預測、不保證中獎，亦不提供任何明牌或獲利承諾。</span>
          <span className="first-visit-consent-paragraph">本系統未與任何官方或民間彩券發行機構、博弈平台有所關聯，亦不提供任何線上投注、賭博或代購服務。</span>
          <span className="first-visit-consent-paragraph">進入系統前，請確認您已閱讀並同意本系統之《隱私權政策》，並承諾將本工具用於合法之數據研究用途。</span>
        </>,
        confirmLabel: '同意條款並進入系統',
      }).then((confirmed) => {
        if (active && confirmed) {
          try { window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1'); } catch { /* Optional persistence. */ }
        }
      });
    });

    return () => { active = false; };
  }, [confirm, enabled]);

  return null;
}
