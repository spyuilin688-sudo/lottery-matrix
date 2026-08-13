import { useEffect, useState } from "react";
import { fetchTransfers } from "./api";
import type { TransferRecord, TransferView } from "./types";

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

function ReviewActions() {
  return (
    <div className="admin-record-actions">
      <button type="button" disabled>
        確認收款
      </button>
      <button type="button" disabled>
        退回
      </button>
    </div>
  );
}

export default function AdminTransfers() {
  const [transfers, setTransfers] = useState<TransferView[]>([]);
  const [dataState, setDataState] = useState<DataState>("loading");

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

  if (dataState !== "ready") {
    return <section className="admin-record-screen" data-testid="admin-transfers" data-state={dataState} />;
  }

  return (
    <section className="admin-record-screen" data-testid="admin-transfers" data-state={dataState}>
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
                  <button type="button" disabled>
                    確認收款
                  </button>
                </td>
                <td>
                  <button type="button" disabled>
                    退回
                  </button>
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
            <ReviewActions />
          </article>
        ))}
      </div>
    </section>
  );
}
