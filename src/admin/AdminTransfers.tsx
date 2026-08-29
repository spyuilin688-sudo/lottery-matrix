import { useEffect, useState } from "react";
import { fetchTransfers, reviewTransferRequest } from "./api";
import type { TransferRecord, TransferReviewDecision, TransferView } from "./types";

type DataState = "loading" | "ready" | "empty" | "error";

const columns = ["會員", "付款方案", "轉帳金額", "轉帳時間", "帳號末五碼", "申請時間", "付款狀態"] as const;

const statusLabels: Record<TransferRecord["status"], string> = {
  pending: "待確認",
  confirmed: "已確認",
  rejected: "已退回",
};

function TransferFields({ transfer, table }: { transfer: TransferView; table?: boolean }) {
  const values = [
    transfer.member.line_user_id ?? transfer.member.id,
    transfer.plan.name,
    new Intl.NumberFormat("zh-TW").format(transfer.amount),
    transfer.transferred_at,
    transfer.account_last_five,
    transfer.submitted_at,
    statusLabels[transfer.status],
  ];

  return (
    <>
      {columns.map((label, index) =>
        table ? (
          <td key={label}>{values[index]}</td>
        ) : (
          <span key={label} data-label={label}>
            {values[index]}
          </span>
        ),
      )}
    </>
  );
}

function ReviewButton({ transfer, decision, processing, onReview }: {
  transfer: TransferView;
  decision: TransferReviewDecision;
  processing: boolean;
  onReview: (transfer: TransferView, decision: TransferReviewDecision) => void;
}) {
  const disabled = transfer.status !== "pending" || processing;
  return <button type="button" disabled={disabled} onClick={() => onReview(transfer, decision)}>{decision === "confirmed" ? "確認收款" : "退回"}</button>;
}

export default function AdminTransfers() {
  const [transfers, setTransfers] = useState<TransferView[]>([]);
  const [dataState, setDataState] = useState<DataState>("loading");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState(false);

  const loadTransfers = async () => {
    const records = await fetchTransfers();
    setTransfers(records);
    setDataState(records.length === 0 ? "empty" : "ready");
  };

  useEffect(() => {
    let active = true;

    void fetchTransfers().then(
      (records) => {
        if (!active) return;
        setTransfers(records);
        setDataState(records.length === 0 ? "empty" : "ready");
      },
      () => {
        if (active) setDataState("error");
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const handleReview = async (transfer: TransferView, decision: TransferReviewDecision) => {
    if (transfer.status !== "pending" || processingId) return;
    setProcessingId(transfer.id);
    setReviewError(false);
    try {
      await reviewTransferRequest(transfer.id, decision);
      await loadTransfers();
    } catch {
      setReviewError(true);
    } finally {
      setProcessingId(null);
    }
  };

  if (dataState !== "ready") {
    return <section className="admin-record-screen" data-testid="admin-transfers" data-state={dataState} />;
  }

  return (
    <section className="admin-record-screen" data-testid="admin-transfers" data-state={dataState}>
      {reviewError ? <p role="alert">轉帳審核失敗，請稍後再試。</p> : null}
      <div className="admin-record-table-wrap">
        <table className="admin-record-table">
          <thead>
            <tr>
              {columns.map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
              <th scope="col">確認收款</th>
              <th scope="col">退回</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id}>
                <TransferFields transfer={transfer} table />
                <td>
                  <ReviewButton transfer={transfer} decision="confirmed" processing={processingId === transfer.id} onReview={handleReview} />
                </td>
                <td>
                  <ReviewButton transfer={transfer} decision="rejected" processing={processingId === transfer.id} onReview={handleReview} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-record-cards">
        {transfers.map((transfer) => (
          <article className="admin-record-card" key={transfer.id}>
            <TransferFields transfer={transfer} />
            <div className="admin-record-actions">
              <ReviewButton transfer={transfer} decision="confirmed" processing={processingId === transfer.id} onReview={handleReview} />
              <ReviewButton transfer={transfer} decision="rejected" processing={processingId === transfer.id} onReview={handleReview} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
