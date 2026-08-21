import { useEffect, useMemo, useState } from "react";
import { api, auth } from "@appdeploy/client";
import {
  BarChart3,
  Users,
  CreditCard,
  Activity,
  Wallet,
  LogIn,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Settings,
  KeyRound,
  Menu,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
} from "lucide-react";
import "./admin.css";
import "./profile-name.css";
import "./admin-operations.css";
import "./system-status.css";
import { saveOwnAdminName } from "./admin-profile";
import { filterRows, saveMemberStatus, saveSubscription } from "./admin-operations";
import { loadSystemStatus, type SystemStatusItem } from "./system-status";
type Row = Record<string, unknown> & { id: string };
type Dashboard = {
  totalUsers: number;
  monthlyPro: number;
  quarterlyPro: number;
  yearlyPro: number;
  expiring: number;
  todayRevenue: number;
  monthRevenue: number;
  quarterRevenue: number;
  yearRevenue: number;
  cumulativeRevenue: number;
};
type AlgorithmStatus = {
  ok: boolean;
  health: unknown | null;
  coverage: unknown | null;
  audit: unknown | null;
  cases: unknown | null;
};
type AdminForm = {
  account: string;
  name: string;
  role: string;
  status: string;
  permissions: { view: boolean; add: boolean; edit: boolean; delete: boolean };
};
const modules = [
  ["營運概覽", BarChart3],
  ["用戶管理", Users],
  ["訂閱管理", CreditCard],
  ["數據分析", Activity],
  ["收入報表", Wallet],
  ["登入紀錄", LogIn],
  ["訂閱紀錄", ReceiptText],
  ["審計日誌", ScrollText],
  ["管理員權限", ShieldCheck],
  ["系統設定", Settings],
  ["啟動碼管理", KeyRound],
] as const;
const tableMap: Record<string, string> = {
  用戶管理: "users",
  訂閱管理: "subscriptions",
  登入紀錄: "loginRecords",
  訂閱紀錄: "subscriptionRecords",
  審計日誌: "auditLogs",
  啟動碼管理: "activationCodes",
};
const labels: Record<string, string[]> = {
  users: [
    "authUserId",
    "lineUserId",
    "registeredAt",
    "currentPlanId",
    "planStartedAt",
    "planExpiresAt",
    "isLifetime",
    "status",
    "referralCode",
    "invitationCode",
  ],
  subscriptions: [
    "authUserId",
    "currentPlanId",
    "planName",
    "planPrice",
    "planDurationDays",
    "planStartedAt",
    "planExpiresAt",
    "isLifetime",
    "status",
  ],
  loginRecords: [
    "account",
    "loginAt",
    "logoutAt",
    "onlineMinutes",
    "ip",
    "device",
  ],
  subscriptionRecords: [
    "memberId",
    "planId",
    "amount",
    "paidAt",
    "status",
  ],
  auditLogs: [
    "operationTime",
    "admin",
    "operationType",
    "targetTable",
    "targetId",
    "content",
    "beforeData",
    "afterData",
    "ip",
    "device",
  ],
  activationCodes: [
    "code",
    "durationType",
    "status",
    "createdAt",
    "redeemedByMemberId",
    "redeemedAt",
    "expiresAt",
    "batchId",
  ],
};
const zh: Record<string, string> = {
  authUserId: "驗證用戶 ID",
  lineUserId: "LINE 用戶 ID",
  registeredAt: "註冊日期",
  currentPlanId: "目前方案 ID",
  planStartedAt: "方案開始時間",
  planExpiresAt: "方案到期時間",
  isLifetime: "永久方案",
  autoRenew: "自動續訂",
  referralCode: "推薦碼",
  invitationCode: "邀請碼",
  planName: "方案名稱",
  planPrice: "方案價格",
  planDurationDays: "方案天數",
  account: "管理員帳號",
  loginAt: "登入時間",
  logoutAt: "登出時間",
  onlineMinutes: "本次在線時間",
  ip: "IP",
  device: "裝置資訊",
  memberId: "會員 ID",
  planId: "方案 ID",
  amount: "金額",
  paidAt: "付款時間",
  status: "狀態",
  operationTime: "操作時間",
  admin: "管理員",
  operationType: "操作類型",
  targetTable: "目標資料表",
  targetId: "目標 ID",
  content: "操作內容",
  beforeData: "修改前資料",
  afterData: "修改後資料",
  code: "啟動碼",
  durationType: "啟動期限",
  createdAt: "建立時間",
  redeemedByMemberId: "兌換會員",
  redeemedAt: "兌換時間",
  expiresAt: "到期時間",
  batchId: "批次",
};
const money = (n: number) => `$${Number(n || 0).toLocaleString("zh-TW")}`;
const text = (v: unknown) =>
  typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—");
const defaultAdmin = (role = "查看人員"): AdminForm => ({
  account: "",
  name: "",
  role,
  status: "啟用",
  permissions:
    role === "營運管理員"
      ? { view: true, add: true, edit: true, delete: false }
      : { view: true, add: false, edit: false, delete: false },
});
function AdminApp() {
  const [signed, setSigned] = useState(auth.isSignedIn());
  const [admin, setAdmin] = useState<Record<string, unknown> | null>(null);
  const [active, setActive] = useState("營運概覽");
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [transfers, setTransfers] = useState<Row[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [algorithmStatus, setAlgorithmStatus] =
    useState<AlgorithmStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [adminForm, setAdminForm] = useState<AdminForm>(defaultAdmin());
  const [editingAdmin, setEditingAdmin] = useState<string | null>(null);
  const [showProfileName, setShowProfileName] = useState(false);
  const [profileName, setProfileName] = useState("");
  const can = (k: string) =>
    Boolean(
      (admin?.permissions as Record<string, boolean> | undefined)?.[k] ??
        admin?.role === "超級管理員",
    );
  const isSuper = admin?.role === "超級管理員";
  const moduleCan = (module: string, action: "view" | "edit") =>
    Boolean(
      (admin?.modulePermissions as Record<string, Record<string, boolean>> | undefined)?.[module]?.[action]
      ?? admin?.role === "超級管理員",
    );
  const load = async (name = active) => {
    setBusy(true);
    setError("");
    try {
      if (name === "營運概覽") {
        const [dashboardResult, algorithmResult] = await Promise.allSettled([
          api.get("/api/dashboard"),
          api.get("/api/algorithm-status"),
        ]);
        if (dashboardResult.status === "rejected") throw dashboardResult.reason;
        setDash(dashboardResult.value.data);
        setAlgorithmStatus(
          algorithmResult.status === "fulfilled"
            ? algorithmResult.value.data
            : {
                ok: false,
                health: null,
                coverage: null,
                audit: null,
                cases: null,
              },
        );
        setRows([]);
      } else if (name === "數據分析" || name === "收入報表") {
        const r = await api.get("/api/dashboard");
        setDash(r.data);
        setRows([]);
      } else if (name === "管理員權限") {
        const r = await api.get("/api/data/admins");
        setRows(r.data.items || []);
      } else if (name === "訂閱管理") {
        const [subscriptionsResult, plansResult, transfersResult] = await Promise.all([
          api.get("/api/data/subscriptions"),
          api.get("/api/data/plans"),
          api.get("/api/data/transferRequests"),
        ]);
        setRows(subscriptionsResult.data.items || []);
        setPlans(plansResult.data.items || []);
        setTransfers(transfersResult.data.items || []);
      } else if (name === "系統設定") {
        setRows([]);
      } else {
        const t = tableMap[name];
        if (t) {
          const r = await api.get(`/api/data/${t}`);
          setRows(r.data.items || []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "資料讀取失敗");
    } finally {
      setBusy(false);
    }
  };
  const boot = async () => {
    setBusy(true);
    setError("");
    try {
      const u = await auth.getUser();
      if (!u) {
        setSigned(false);
        return;
      }
      setSigned(true);
      const r = await api.get("/api/bootstrap");
      setAdmin(r.data.admin);
      await load("營運概覽");
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法載入後台");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (signed) void boot();
  }, []);
  const choose = (name: string) => {
    setActive(name);
    setDrawer(false);
    setShowForm(false);
    setEditingAdmin(null);
    void load(name);
  };
  const signIn = async () => {
    setError("");
    try {
      await auth.signIn();
      setSigned(true);
      await boot();
    } catch (e) {
      const c = (e as { code?: string }).code;
      setError(
        c === "popup_blocked"
          ? "瀏覽器阻擋登入視窗"
          : c === "popup_closed"
            ? "已取消登入"
            : "登入失敗",
      );
    }
  };
  const signOut = async () => {
    await auth.signOut();
    setSigned(false);
    setAdmin(null);
  };
  const openProfileName = () => {
    setProfileName(String(admin?.name || ""));
    setShowProfileName(true);
  };
  const saveProfileName = async () => {
    setBusy(true);
    setError("");
    try {
      const updated = await saveOwnAdminName(api, profileName);
      setAdmin((current) => ({ ...current, ...updated }));
      setShowProfileName(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "管理員名稱更新失敗");
    } finally {
      setBusy(false);
    }
  };
  const fields = useMemo(() => labels[tableMap[active]] || [], [active]);
  const batchCodes = async () => {
    setBusy(true);
    try {
      await api.post("/api/activation-codes/batch", {
        durationType: form.durationType || "30_days",
      });
      setShowForm(false);
      setForm({});
      await load(active);
    } catch (e) {
      setError(e instanceof Error ? e.message : "批次建立失敗");
    } finally {
      setBusy(false);
    }
  };
  const saveAdmin = async () => {
    setBusy(true);
    setError("");
    try {
      if (editingAdmin) await api.put(`/api/admins/${editingAdmin}`, adminForm);
      else await api.post("/api/admins", adminForm);
      setAdminForm(defaultAdmin());
      setEditingAdmin(null);
      setShowForm(false);
      await load("管理員權限");
    } catch (e) {
      setError(e instanceof Error ? e.message : "管理員儲存失敗");
    } finally {
      setBusy(false);
    }
  };
  const editAdmin = (r: Row) => {
    const p = (r.permissions || {}) as Record<string, boolean>;
    setAdminForm({
      account: String(r.account || ""),
      name: String(r.name || ""),
      role: String(r.role || "查看人員"),
      status: String(r.status || "啟用"),
      permissions: {
        view: Boolean(p.view),
        add: Boolean(p.add),
        edit: Boolean(p.edit),
        delete: Boolean(p.delete),
      },
    });
    setEditingAdmin(r.id);
    setShowForm(true);
  };
  const deleteAdmin = async (id: string) => {
    if (!confirm("確認刪除此管理員帳號？")) return;
    setBusy(true);
    try {
      await api.delete(`/api/admins/${id}`);
      await load("管理員權限");
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除管理員失敗");
    } finally {
      setBusy(false);
    }
  };
  const roleChange = (role: string) => setAdminForm(defaultAdmin(role));
  if (!signed)
    return (
      <div className="login">
        <div className="loginCard">
          <div className="brand">樂彩 Matrix</div>
          <h1>營運後台</h1>
          <p>管理員登入</p>
          <button onClick={signIn}>登入營運後台</button>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  return (
    <div className="shell">
      <aside className={drawer ? "side open" : "side"}>
        <div className="sideTitle">
          樂彩 Matrix<small>營運後台</small>
        </div>
        <nav>
          {modules.map(([n, I], i) => (
            <button
              key={n}
              className={active === n ? "nav active" : "nav"}
              onClick={() => choose(n)}
            >
              <I size={18} />
              <span>
                {i + 1}. {n}
              </span>
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <button className="menu" onClick={() => setDrawer(!drawer)}>
            <Menu size={22} />
          </button>
          <div>
            <b>{active}</b>
          </div>
          <div className="actions">
            <button className="profileName" onClick={openProfileName} title="修改自己的名稱">
              {String(admin?.name || admin?.account || "管理員")}
            </button>
            <button onClick={() => load()} title="重新整理">
              <RefreshCw size={18} />
            </button>
            <button onClick={signOut} title="登出">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {showProfileName && (
          <div className="modalBackdrop" role="presentation">
            <div className="nameDialog" role="dialog" aria-modal="true" aria-labelledby="profile-name-title">
              <h2 id="profile-name-title">修改名稱</h2>
              <label>
                管理員名稱
                <input
                  autoFocus
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                />
              </label>
              <div className="formActions">
                <button onClick={() => setShowProfileName(false)}>取消</button>
                <button className="primary" onClick={saveProfileName} disabled={busy}>
                  儲存
                </button>
              </div>
            </div>
          </div>
        )}
        <section className="content">
          {error && <div className="error">{error}</div>}
          {busy && <div className="loading">資料處理中…</div>}
          {active === "營運概覽" && dash && (
            <Overview d={dash} algorithmStatus={algorithmStatus} />
          )}{" "}
          {active === "數據分析" && dash && <Analytics d={dash} />}{" "}
          {active === "收入報表" && dash && <Revenue d={dash} />}{" "}
          {active === "系統設定" && <SystemSettings />}{" "}
          {active === "用戶管理" && (
            <UserManager
              rows={rows}
              canEdit={moduleCan("users", "edit")}
              onStatus={async (id, status) => {
                setBusy(true);
                setError("");
                try {
                  await saveMemberStatus(api, id, status);
                  await load("用戶管理");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "會員狀態更新失敗");
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}{" "}
          {active === "訂閱管理" && (
            <SubscriptionManager
              rows={rows}
              plans={plans}
              transfers={transfers}
              canEdit={moduleCan("subscriptions", "edit")}
              onSubscription={async (id, payload) => {
                setBusy(true);
                setError("");
                try {
                  await saveSubscription(api, id, payload);
                  await load("訂閱管理");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "訂閱更新失敗");
                } finally {
                  setBusy(false);
                }
              }}
              onTransfer={async (id, decision) => {
                setBusy(true);
                setError("");
                try {
                  await api.put(`/api/transfer-requests/${id}`, { decision });
                  await load("訂閱管理");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "轉帳審核失敗");
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}{" "}
          {active === "管理員權限" && (
            <AdminManager
              rows={rows}
              isSuper={Boolean(isSuper)}
              showForm={showForm}
              setShowForm={setShowForm}
              form={adminForm}
              setForm={setAdminForm}
              editing={Boolean(editingAdmin)}
              onRole={roleChange}
              onSave={saveAdmin}
              onEdit={editAdmin}
              onDelete={deleteAdmin}
            />
          )}{" "}
          {tableMap[active] && !["用戶管理", "訂閱管理"].includes(active) && (
            <>
              <div className="toolbar">
                <div>{rows.length} 筆資料</div>
                {can("add") && active === "啟動碼管理" && (
                    <button
                      className="primary"
                      onClick={() => setShowForm(!showForm)}
                    >
                      <Plus size={16} />
                      新增
                    </button>
                  )}
              </div>
              {showForm && (
                <div className="formCard">
                  <h3>建立啟動碼</h3>
                  <div className="formGrid">
                    <label>
                      啟動期限
                      <select
                        value={form.durationType || "30_days"}
                        onChange={(e) =>
                          setForm({ ...form, durationType: e.target.value })
                        }
                      >
                        <option value="7_days">7 天</option>
                        <option value="15_days">15 天</option>
                        <option value="30_days">30 天</option>
                        <option value="90_days">90 天</option>
                        <option value="365_days">365 天</option>
                        <option value="lifetime">永久</option>
                      </select>
                    </label>
                  </div>
                  <div className="formActions">
                    <button onClick={() => setShowForm(false)}>取消</button>
                    <button className="primary" onClick={batchCodes}>
                      批次建立 10 組
                    </button>
                  </div>
                </div>
              )}
              <DataTable
                rows={rows}
                fields={fields}
                canDelete={false}
                onDelete={() => undefined}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
function UserManager({
  rows,
  canEdit,
  onStatus,
}: {
  rows: Row[];
  canEdit: boolean;
  onStatus: (id: string, status: "active" | "disabled") => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = filterRows(rows, keyword, status);
  const fields = ["authUserId", "lineUserId", "planName", "planExpiresAt", "status", "referralCode", "invitationCode"];
  const statusText = (value: unknown) => String(value) === "disabled" || String(value) === "停用" ? "停用" : "啟用";
  return (
    <>
      <div className="managementToolbar">
        <input aria-label="搜尋會員" placeholder="搜尋會員、方案、推薦碼或邀請碼" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <select aria-label="篩選會員狀態" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">全部狀態</option>
          <option value="active">啟用</option>
          <option value="disabled">停用</option>
        </select>
        <span>{filtered.length} 筆資料</span>
      </div>
      <div className="desktopManagement tableWrap">
        <table>
          <thead><tr>{fields.map((field) => <th key={field}>{zh[field] || field}</th>)}<th>操作</th></tr></thead>
          <tbody>{filtered.length === 0 ? <tr><td colSpan={fields.length + 1} className="empty">目前沒有資料</td></tr> : filtered.map((row) => (
            <tr key={row.id}>
              {fields.map((field) => <td key={field}>{field === "status" ? statusText(row[field]) : text(row[field])}</td>)}
              <td>{canEdit && <button className="compactButton" onClick={() => onStatus(row.id, statusText(row.status) === "停用" ? "active" : "disabled")}>{statusText(row.status) === "停用" ? "啟用" : "停用"}</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mobileManagement">
        {filtered.map((row) => (
          <article className="managementCard" key={row.id}>
            <div className="cardHeading"><b>{text(row.authUserId)}</b><span className={statusText(row.status) === "停用" ? "statusBadge bad" : "statusBadge good"}>{statusText(row.status)}</span></div>
            {fields.slice(1).map((field) => <div className="cardRow" key={field}><span>{zh[field] || field}</span><b>{field === "status" ? statusText(row[field]) : text(row[field])}</b></div>)}
            {canEdit && <button className="compactButton" onClick={() => onStatus(row.id, statusText(row.status) === "停用" ? "active" : "disabled")}>{statusText(row.status) === "停用" ? "啟用會員" : "停用會員"}</button>}
          </article>
        ))}
      </div>
    </>
  );
}

type SubscriptionPayload = {
  action: "activate" | "renew" | "cancel" | "adjustExpiry" | "lifetime";
  planId?: string;
  expiresAt?: string;
};

function SubscriptionManager({
  rows,
  plans,
  transfers,
  canEdit,
  onSubscription,
  onTransfer,
}: {
  rows: Row[];
  plans: Row[];
  transfers: Row[];
  canEdit: boolean;
  onSubscription: (id: string, payload: SubscriptionPayload) => Promise<void>;
  onTransfer: (id: string, decision: "confirmed" | "rejected") => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [action, setAction] = useState<SubscriptionPayload["action"]>("activate");
  const [planId, setPlanId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const filtered = filterRows(rows, keyword, status);
  const open = (row: Row, nextAction: SubscriptionPayload["action"]) => {
    setEditing(row);
    setAction(nextAction);
    setPlanId(String(row.currentPlanId || plans[0]?.id || ""));
    setExpiresAt(String(row.planExpiresAt || "").slice(0, 10));
  };
  const submit = async () => {
    if (!editing) return;
    const payload: SubscriptionPayload = { action };
    if (action === "activate" || action === "renew") payload.planId = planId;
    if (action === "adjustExpiry") payload.expiresAt = expiresAt;
    await onSubscription(editing.id, payload);
    setEditing(null);
  };
  const actionText: Record<SubscriptionPayload["action"], string> = {
    activate: "開通", renew: "續訂", cancel: "取消續訂", adjustExpiry: "調整到期日", lifetime: "設為終生",
  };
  return (
    <>
      <div className="managementToolbar">
        <input aria-label="搜尋訂閱" placeholder="搜尋會員或方案" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <select aria-label="篩選訂閱狀態" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">全部狀態</option><option value="active">啟用</option><option value="disabled">停用</option>
        </select>
        <span>{filtered.length} 筆資料</span>
      </div>
      <div className="desktopManagement tableWrap">
        <table>
          <thead><tr><th>驗證用戶 ID</th><th>方案名稱</th><th>方案開始時間</th><th>方案到期時間</th><th>終生</th><th>自動續訂</th><th>操作</th></tr></thead>
          <tbody>{filtered.length === 0 ? <tr><td colSpan={7} className="empty">目前沒有資料</td></tr> : filtered.map((row) => (
            <tr key={row.id}>
              <td>{text(row.authUserId)}</td><td>{text(row.planName)}</td><td>{text(row.planStartedAt)}</td><td>{row.isLifetime ? "終生" : text(row.planExpiresAt)}</td><td>{row.isLifetime ? "是" : "否"}</td><td>{row.autoRenew ? "是" : "否"}</td>
              <td>{canEdit && <div className="cardActions">{(["activate", "renew", "cancel", "adjustExpiry", "lifetime"] as const).map((item) => <button key={item} className="compactButton" onClick={() => open(row, item)}>{actionText[item]}</button>)}</div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mobileManagement subscriptionGrid">
        {filtered.map((row) => (
          <article className="managementCard" key={row.id}>
            <div className="cardHeading"><b>{text(row.authUserId)}</b><span>{text(row.planName)}</span></div>
            <div className="cardRow"><span>方案開始時間</span><b>{text(row.planStartedAt)}</b></div>
            <div className="cardRow"><span>方案到期時間</span><b>{row.isLifetime ? "終生" : text(row.planExpiresAt)}</b></div>
            <div className="cardRow"><span>自動續訂</span><b>{row.autoRenew ? "是" : "否"}</b></div>
            {canEdit && <div className="cardActions">{(["activate", "renew", "cancel", "adjustExpiry", "lifetime"] as const).map((item) => <button key={item} className="compactButton" onClick={() => open(row, item)}>{actionText[item]}</button>)}</div>}
          </article>
        ))}
      </div>
      {editing && (
        <div className="modalBackdrop" role="presentation">
          <div className="operationDialog" role="dialog" aria-modal="true">
            <h2>{actionText[action]}</h2>
            <p>{text(editing.authUserId)}</p>
            {(action === "activate" || action === "renew") && <label>方案<select value={planId} onChange={(event) => setPlanId(event.target.value)}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{text(plan.name)}／{money(Number(plan.price))}／{text(plan.durationDays)} 天</option>)}</select></label>}
            {action === "adjustExpiry" && <label>到期日<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>}
            {action === "cancel" && <p>取消後只停止自動續訂，權限保留至到期日。</p>}
            <div className="formActions"><button onClick={() => setEditing(null)}>取消</button><button className="primary" onClick={submit}>確認</button></div>
          </div>
        </div>
      )}
      <div className="panel transferPanel">
        <h2>轉帳申請</h2>
        {transfers.length === 0 ? <div className="empty">目前沒有資料</div> : transfers.map((row) => (
          <div className="transferRow" key={row.id}>
            <div><b>{text(row.authUserId)}</b><span>{text(row.planName)}／{money(Number(row.amount))}／末五碼 {text(row.accountLastFive)}</span></div>
            <span>{text(row.status)}</span>
            {canEdit && row.status === "pending" && <div className="rowActions"><button onClick={() => onTransfer(row.id, "confirmed")}>確認</button><button className="danger" onClick={() => onTransfer(row.id, "rejected")}>拒絕</button></div>}
          </div>
        ))}
      </div>
    </>
  );
}

function AdminManager({
  rows,
  isSuper,
  showForm,
  setShowForm,
  form,
  setForm,
  editing,
  onRole,
  onSave,
  onEdit,
  onDelete,
}: {
  rows: Row[];
  isSuper: boolean;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  form: AdminForm;
  setForm: (v: AdminForm) => void;
  editing: boolean;
  onRole: (v: string) => void;
  onSave: () => void;
  onEdit: (r: Row) => void;
  onDelete: (id: string) => void;
}) {
  const roleDescription: Record<string, string> = {
    超級管理員: "用戶管理、訂閱管理、啟動碼管理、系統設定、管理員權限",
    營運管理員: "用戶管理、訂閱管理、啟動碼管理；系統設定僅查看",
    查看人員: "用戶管理、訂閱管理、啟動碼管理、系統設定僅查看",
  };
  return (
    <>
      <div className="toolbar">
        <div>{rows.length} 個管理員帳號</div>
        {isSuper && (
          <button className="primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} />
            新增管理員
          </button>
        )}
      </div>
      {showForm && isSuper && (
        <div className="formCard">
          <h3>{editing ? "修改管理員" : "新增管理員"}</h3>
          <div className="formGrid">
            <label>
              管理員帳號
              <input
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value })}
              />
            </label>
            <label>
              管理員名稱
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              角色
              <select
                value={form.role}
                onChange={(e) => onRole(e.target.value)}
              >
                <option>超級管理員</option>
                <option>營運管理員</option>
                <option>查看人員</option>
              </select>
            </label>
            <label>
              帳號狀態
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>啟用</option>
                <option>停用</option>
              </select>
            </label>
          </div>
          <div className="permissionBox"><b>角色權限</b><span>{roleDescription[form.role]}</span></div>
          <div className="formActions">
            <button onClick={() => setShowForm(false)}>取消</button>
            <button className="primary" onClick={onSave}>
              儲存
            </button>
          </div>
        </div>
      )}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>管理員帳號</th>
              <th>管理員名稱</th>
              <th>角色</th>
              <th>帳號狀態</th>
              <th>最後登入時間</th>
              <th>功能權限</th>
              {isSuper && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  目前沒有資料
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                return (
                  <tr key={r.id}>
                    <td>{text(r.account)}</td>
                    <td>{text(r.name)}</td>
                    <td>{text(r.role)}</td>
                    <td>{text(r.status)}</td>
                    <td>{text(r.lastLoginAt)}</td>
                    <td>{roleDescription[String(r.role)] || "—"}</td>
                    {isSuper && (
                      <td>
                        <div className="rowActions">
                          <button onClick={() => onEdit(r)}>
                            <Pencil size={15} />
                          </button>
                          <button
                            className="danger"
                            onClick={() => onDelete(r.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Cards({ items }: { items: [string, string][] }) {
  return (
    <div className="cards">
      {items.map(([a, b]) => (
        <div className="metric" key={a}>
          <span>{a}</span>
          <strong>{b}</strong>
        </div>
      ))}
    </div>
  );
}
function Overview({
  d,
  algorithmStatus,
}: {
  d: Dashboard;
  algorithmStatus: AlgorithmStatus | null;
}) {
  return (
    <>
      <Cards
        items={[
          ["總用戶數", String(d.totalUsers)],
          ["Matrix Pro 月費用戶數", String(d.monthlyPro)],
          ["Matrix Pro 季費用戶數", String(d.quarterlyPro)],
          ["Matrix Pro 年費用戶數", String(d.yearlyPro)],
          ["即將到期用戶數", String(d.expiring)],
        ]}
      />
      <div className="panel">
        <h2>成長曲線</h2>
        <div className="emptyChart">資料將依實際紀錄累積呈現</div>
      </div>
      <div className="panel">
        <h2>演算法 API 狀態</h2>
        <p>{algorithmStatus?.ok ? "連線正常" : "目前無法取得狀態"}</p>
        {algorithmStatus?.ok && (
          <div className="settingRows">
            <div>
              <b>健康檢查</b>
              <span>{text(algorithmStatus.health)}</span>
            </div>
            <div>
              <b>資料覆蓋率</b>
              <span>{text(algorithmStatus.coverage)}</span>
            </div>
            <div>
              <b>稽核狀態</b>
              <span>{text(algorithmStatus.audit)}</span>
            </div>
            <div>
              <b>演算法案例</b>
              <span>{text(algorithmStatus.cases)}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
function Analytics({ d }: { d: Dashboard }) {
  return (
    <>
      <Cards
        items={[
          ["總用戶數", String(d.totalUsers)],
          ["Matrix Pro 月費", String(d.monthlyPro)],
          ["Matrix Pro 季費", String(d.quarterlyPro)],
          ["Matrix Pro 年費", String(d.yearlyPro)],
          ["即將到期", String(d.expiring)],
        ]}
      />
      <div className="panel">
        <h2>數據分析</h2>
        <p>
          每日／每週／每月新增用戶、活躍用戶、訂閱新增／到期／續訂與三項成長曲線均由後台資料庫紀錄計算。
        </p>
      </div>
    </>
  );
}
function Revenue({ d }: { d: Dashboard }) {
  return (
    <>
      <Cards
        items={[
          ["今日收入", money(d.todayRevenue)],
          ["本月收入", money(d.monthRevenue)],
          ["本季收入", money(d.quarterRevenue)],
          ["本年收入", money(d.yearRevenue)],
          ["累積收入", money(d.cumulativeRevenue)],
        ]}
      />
      <div className="panel">
        <h2>收入成長曲線</h2>
        <div className="emptyChart">
          依 subscriptionRecords 實際收入資料累積
        </div>
      </div>
    </>
  );
}
function SystemSettings() {
  const [items, setItems] = useState<SystemStatusItem[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [checking, setChecking] = useState(false);
  const [statusError, setStatusError] = useState("");
  const refresh = async () => {
    setChecking(true);
    setStatusError("");
    try {
      const result = await loadSystemStatus(api);
      setItems(result.items);
      setCheckedAt(result.checkedAt);
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "連線狀態檢查失敗");
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => { void refresh(); }, []);
  return (
    <>
      <div className="systemStatusHeader">
        <div><h2>連線狀態</h2><span>最後檢查時間：{checkedAt || "尚未檢查"}</span></div>
        <button className="compactButton" onClick={refresh} disabled={checking}><RefreshCw size={15} />{checking ? "檢查中" : "重新檢查"}</button>
      </div>
      {statusError && <div className="error">{statusError}</div>}
      <div className="statusCards">
        {items.map((item) => {
          const detail = item.detail && typeof item.detail === "object" ? item.detail as Record<string, unknown> : null;
          return (
            <article className="statusCard" key={item.id}>
              <div className="statusCardTitle"><b>{item.name}</b><span className={item.ok ? "statusBadge good" : "statusBadge bad"}>{item.ok ? "正常" : "異常"}</span></div>
              <p>{item.description}</p>
              <div className="statusMeta"><span>最後檢查時間</span><b>{item.checkedAt}</b></div>
              <div className="statusMeta"><span>回應時間</span><b>{item.responseMs} ms</b></div>
              {detail?.status !== undefined && <div className="statusMeta"><span>排程最後執行狀態</span><b>{text(detail.status)}</b></div>}
              {detail?.finished_at !== undefined && <div className="statusMeta"><span>排程完成時間</span><b>{text(detail.finished_at)}</b></div>}
              {item.error && <div className="statusErrorText">{item.error}</div>}
            </article>
          );
        })}
      </div>
      <div className="panel">
        <h2>其他設定</h2>
        <div className="settingRows">
          <div><b>管理員密碼修改</b><span>由登入帳號提供者管理</span></div>
          <div><b>後台登入安全設定</b><span>登入驗證已啟用</span></div>
          <div><b>操作日誌查看</b><span>請至「審計日誌」查看</span></div>
        </div>
      </div>
    </>
  );
}
function DataTable({
  rows,
  fields,
  canDelete,
  onDelete,
}: {
  rows: Row[];
  fields: string[];
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f}>{zh[f] || f}</th>
            ))}
            {canDelete && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={fields.length + 1} className="empty">
                目前沒有資料
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                {fields.map((f) => (
                  <td key={f}>{text(r[f])}</td>
                ))}
                {canDelete && (
                  <td>
                    <button className="danger" onClick={() => onDelete(r.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
export default AdminApp;
