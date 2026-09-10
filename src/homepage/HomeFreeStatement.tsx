import { useSubscriptionPurchaseVisible } from '../subscription-purchase-visibility';
import './free-statement.css';

export function HomeFreeStatement() {
  if (useSubscriptionPurchaseVisible()) return null;
  return <aside className="home-free-statement" aria-label="免費聲明">
    <p>本站僅提供公開歷史數據查詢，不提供任何投注建議。</p>
    <p>本服務僅供學術參考研究使用，不保証數據之即時性與準確性。</p>
  </aside>;
}
