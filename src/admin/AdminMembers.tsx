import { useEffect, useState } from "react";
import { fetchMembers, fetchPayments } from "./api";
import type { MemberView, PaymentView } from "./types";

type DataState = "loading" | "ready" | "empty" | "error";

const columns = [
  "會員編號",
  "LINE 識別資料",
  "註冊日期",
  "目前方案",
  "方案開始日期",
  "方案到期日期",
  "會員狀態",
  "付款紀錄",
  "推薦碼",
  "邀請碼",
] as const;

function MemberFields({
  member,
  paymentCount,
  table,
}: {
  member: MemberView;
  paymentCount: number;
  table?: boolean;
}) {
  const values = [
    member.id,
    member.line_user_id,
    member.registered_at,
    member.current_plan?.name,
    member.plan_started_at,
    member.plan_expires_at,
    member.status,
    String(paymentCount),
    member.referral_code,
    member.invitation_code,
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

export default function AdminMembers() {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [dataState, setDataState] = useState<DataState>("loading");

  useEffect(() => {
    let active = true;

    void Promise.all([fetchMembers(), fetchPayments()]).then(
      ([memberRecords, paymentRecords]) => {
        if (!active) return;
        setMembers(memberRecords);
        setPayments(paymentRecords);
        setDataState(memberRecords.length === 0 ? "empty" : "ready");
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
    return <section className="admin-record-screen" data-testid="admin-members" data-state={dataState} />;
  }

  return (
    <section className="admin-record-screen" data-testid="admin-members" data-state={dataState}>
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
            {members.map((member) => (
              <tr key={member.id}>
                <MemberFields
                  member={member}
                  paymentCount={payments.filter((payment) => payment.member_id === member.id).length}
                  table
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-record-cards">
        {members.map((member) => (
          <article className="admin-record-card" key={member.id}>
            <MemberFields
              member={member}
              paymentCount={payments.filter((payment) => payment.member_id === member.id).length}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
