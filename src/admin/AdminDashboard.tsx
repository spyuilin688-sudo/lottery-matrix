import { useEffect, useState } from "react";
import { fetchDashboardStats } from "./api";
import type { DashboardStats } from "./types";

const emptyStats: DashboardStats = {
  total_members: 0,
  today_members: 0,
  paid_members: 0,
  active_members: 0,
  expired_members: 0,
  today_confirmed_amount: 0,
  month_confirmed_amount: 0,
  lifetime_confirmed_amount: 0,
};

const statistics: Array<{ label: string; field: keyof DashboardStats }> = [
  { label: "總註冊人數", field: "total_members" },
  { label: "今日註冊人數", field: "today_members" },
  { label: "付費會員人數", field: "paid_members" },
  { label: "有效會員人數", field: "active_members" },
  { label: "已到期會員人數", field: "expired_members" },
  { label: "今日確認收款", field: "today_confirmed_amount" },
  { label: "本月確認收款", field: "month_confirmed_amount" },
  { label: "累計確認收款", field: "lifetime_confirmed_amount" },
];

const numberFormatter = new Intl.NumberFormat("zh-TW");

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;

    void fetchDashboardStats().then(
      (result) => {
        if (!active) return;
        setStats(result);
        setDataState("ready");
      },
      () => {
        if (!active) return;
        setDataState("error");
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      className="admin-dashboard"
      data-testid={dataState === "loading" ? undefined : "admin-dashboard"}
      data-state={dataState}
    >
      <div className="admin-stat-grid">
        {statistics.map(({ label, field }) => (
          <article className="admin-stat-card" key={field}>
            <span className="admin-stat-label">{label}</span>
            <strong className="admin-stat-value">{numberFormatter.format(stats[field])}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
