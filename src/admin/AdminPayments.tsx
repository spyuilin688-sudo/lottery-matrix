import { useEffect, useState } from "react";
import { fetchPayments } from "./api";
import type { PaymentRecord, PaymentView } from "./types";

type DataState = "loading" | "ready" | "empty" | "error";

const columns = ["訂單編號", "會員", "方案", "金額", "付款時間", "付款狀態"] as const;

const statusLabels: Record<PaymentRecord["status"], string> = {
  pending: "待確認",
  confirmed: "已確認",
  rejected: "已退回",
};

function PaymentFields({ payment, table }: { payment: PaymentView; table?: boolean }) {
  const values = [
    payment.id,
    payment.member.line_user_id ?? payment.member.id,
    payment.plan.name,
    new Intl.NumberFormat("zh-TW").format(payment.amount),
    payment.paid_at,
    statusLabels[payment.status],
  ];

  return (
    <>
      {columns.map((label, index) =>
        table ? (
          <td key={label}>{values[index] ?? ""}</td>
        ) : (
          <span key={label} data-label={label}>
            {values[index] ?? ""}
          </span>
        ),
      )}
    </>
  );
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [dataState, setDataState] = useState<DataState>("loading");

  useEffect(() => {
    let active = true;

    void fetchPayments().then(
      (records) => {
        if (!active) return;
        setPayments(records);
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
    return <section className="admin-record-screen" data-testid="admin-payments" data-state={dataState} />;
  }

  return (
    <section className="admin-record-screen" data-testid="admin-payments" data-state={dataState}>
      <div className="admin-record-table-wrap">
        <table className="admin-record-table">
          <thead>
            <tr>
              {columns.map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <PaymentFields payment={payment} table />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-record-cards">
        {payments.map((payment) => (
          <article className="admin-record-card" key={payment.id}>
            <PaymentFields payment={payment} />
          </article>
        ))}
      </div>
    </section>
  );
}
