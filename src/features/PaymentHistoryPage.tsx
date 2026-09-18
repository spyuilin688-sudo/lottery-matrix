import type { ReactNode } from "react";
import { paymentStatusLabels, ProfileDetailShell } from "./MemberPages";
import type { Navigate } from "./navigation";
import { usePaymentHistory } from "./use-payment-history";
import "./payment-history.css";

function formatPaymentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function PaymentHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  const payments = usePaymentHistory();
  let content: ReactNode;

  switch (payments.status) {
    case "guest":
      content = <>
        <p role="status">請先登入，即可查看付款紀錄。</p>
        <button type="button" className="primary-action branded-explore-action" onClick={() => onNavigate("profile")}><span>前往登入</span></button>
      </>;
      break;
    case "error":
    case "auth-error":
      content = <div role="alert">
        <p>{payments.status === "auth-error" ? "登入狀態確認失敗，請稍後再試。" : "付款紀錄載入失敗，請稍後再試。"}</p>
        <button type="button" className="primary-action branded-explore-action" aria-label={payments.status === "auth-error" ? "重新確認登入狀態" : "重新載入付款紀錄"} onClick={payments.retry}><span>重新載入</span></button>
      </div>;
      break;
    case "checking":
    case "loading":
      content = <p role="status">{payments.status === "checking" ? "登入狀態確認中…" : "付款紀錄載入中…"}</p>;
      break;
    case "ready":
      content = payments.history.length === 0 ? <p>目前沒有付款紀錄。</p> : (
        <div className="payment-ledger-list">
          {payments.history.map((item) => {
            const statusLabel = paymentStatusLabels[item.status];
            return (
              <article className="payment-ledger-row" key={item.id}>
                <strong>{item.planName}</strong>
                <span className="payment-ledger-amount">{`NT$${item.amount.toLocaleString("en-US")}`}</span>
                <time dateTime={item.submittedAt}>{formatPaymentDate(item.submittedAt)}</time>
                <b className="payment-ledger-status" data-status={item.status}>{item.status === "confirmed" ? `✓ ${statusLabel}` : statusLabel}</b>
              </article>
            );
          })}
        </div>
      );
      break;
  }

  return (
    <ProfileDetailShell title="付款紀錄" onNavigate={onNavigate} className="payment-ledger-screen">
      <section className="panel detail-card payment-ledger-card" aria-label="付款紀錄">
        {content}
      </section>
    </ProfileDetailShell>
  );
}
