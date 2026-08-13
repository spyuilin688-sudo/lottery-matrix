import { useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import AdminDashboard from "./AdminDashboard";
import AdminActivationCodes from "./AdminActivationCodes";
import AdminMembers from "./AdminMembers";
import AdminPayments from "./AdminPayments";
import AdminTransfers from "./AdminTransfers";
import type { AdminSection } from "./types";

const sections: Array<[AdminSection, string]> = [
  ["dashboard", "總覽"],
  ["members", "會員管理"],
  ["transfers", "轉帳審核"],
  ["payments", "付款紀錄"],
  ["activation-codes", "啟動碼管理"],
];

export default function AdminLayout() {
  const [section, setSection] = useState<AdminSection>("dashboard");

  return (
    <main className="admin-app" data-testid="admin-layout">
      <aside className="admin-navigation">
        <nav aria-label="後臺導覽">
          {sections.map(([id, label]) => (
            <button
              className="admin-navigation-entry"
              type="button"
              key={id}
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="admin-logout" type="button" onClick={() => void getSupabaseClient().auth.signOut()}>
          登出
        </button>
      </aside>
      <div className="admin-content" data-section={section}>
        {section === "dashboard" ? <AdminDashboard /> : null}
        {section === "members" ? <AdminMembers /> : null}
        {section === "transfers" ? <AdminTransfers /> : null}
        {section === "payments" ? <AdminPayments /> : null}
        {section === "activation-codes" ? <AdminActivationCodes /> : null}
      </div>
    </main>
  );
}
