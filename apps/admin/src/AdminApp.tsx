import { useEffect, useMemo, useRef, useState } from "react";
import { api, auth } from "@appdeploy/client";
import {
  BarChart3,
  ListTodo,
  Users,
  CreditCard,
  Wallet,
  LogIn,
  Bell,
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
import { deleteActivationCode, filterRows, formatAdminDateTime, paginateRows, saveMemberStatus, saveSubscription } from "./admin-operations";
import { runConfirmed } from "./admin-confirmation";
import {
  canRefreshCrawler,
  canRetrySystemStatus,
  focusSystemStatusAfterAction,
  getGithubStatusFacts,
  groupSystemStatusItems,
  loadSystemStatus,
  refreshCrawlerSystemStatus,
  retrySystemStatus,
  type SystemStatusActionOutcome,
  type SystemStatusItem,
} from "./system-status";
import { NotificationManagement } from "./NotificationManagement";
import { AdminTodos } from "./AdminTodos";
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
type AdminForm = {
  account: string;
  name: string;
  password: string;
  role: string;
  status: string;
  permissions: { view: boolean; add: boolean; edit: boolean; delete: boolean };
};
type PermissionKey = keyof AdminForm["permissions"];
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  resolve: (confirmed: boolean) => void;
};
const modules = [
  ["營運概覽", BarChart3],
  ["代辦事項", ListTodo],
  ["用戶管理", Users],
  ["訂閱管理", CreditCard],
  ["收入報表", Wallet],
  ["登入紀錄", LogIn],
  ["通知管理", Bell],
  ["審計日誌", ScrollText],
  ["管理員權限", ShieldCheck],
  ["系統設定", Settings],
  ["啟動碼管理", KeyRound],
] as const;
const tableMap: Record<string, string> = {
  用戶管理: "users",
  訂閱管理: "subscriptions",
  登入紀錄: "loginRecords",
  審計日誌: "auditLogs",
  啟動碼管理: "activationCodes",
};
const labels: Record<string, string[]> = {
  users: [
    "authUserId",
    "lineDisplayName",
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
  authUserId: "驗證用戶ID",
  lineDisplayName: "LINE名稱",
  registeredAt: "註冊時間",
  lastOnlineAt: "最後上線時間",
  recentOnlineMinutes: "近3日在線時間",
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
const dateFields = new Set(["registeredAt", "planStartedAt", "planExpiresAt", "loginAt", "logoutAt", "operationTime", "paidAt", "createdAt", "redeemedAt", "expiresAt", "lastLoginAt", "lastOnlineAt"]);
const displayValue = (field: string, value: unknown) => dateFields.has(field) ? formatAdminDateTime(value) : text(value);
const permissionEntries: Array<[PermissionKey, string]> = [
  ["view", "查看"],
  ["add", "新增"],
  ["edit", "修改"],
  ["delete", "刪除"],
];
const defaultOperationPermissions = (role: string): AdminForm["permissions"] =>
  role === "超級管理員"
    ? { view: true, add: true, edit: true, delete: true }
    : role === "營運管理員"
      ? { view: true, add: true, edit: true, delete: false }
      : { view: true, add: false, edit: false, delete: false };
const defaultAdmin = (role = "查看人員"): AdminForm => ({
  account: "",
  name: "",
  password: "",
  role,
  status: "啟用",
  permissions: defaultOperationPermissions(role),
});
function AdminApp() {
  const [signed, setSigned] = useState(false);
  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [admin, setAdmin] = useState<Record<string, unknown> | null>(null);
  const [active, setActive] = useState("營運概覽");
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [transfers, setTransfers] = useState<Row[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [adminForm, setAdminForm] = useState<AdminForm>(defaultAdmin());
  const [editingAdmin, setEditingAdmin] = useState<string | null>(null);
  const [showProfileName, setShowProfileName] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const requestConfirmation = (request: Omit<ConfirmationRequest, "resolve">) =>
    new Promise<boolean>((resolve) => setConfirmation({ ...request, resolve }));
  const finishConfirmation = (confirmed: boolean) => {
    confirmation?.resolve(confirmed);
    setConfirmation(null);
  };
  const can = (k: string) =>
    Boolean(
      (admin?.permissions as Record<string, boolean> | undefined)?.[k] ??
        admin?.role === "超級管理員",
    );
  const isSuper = admin?.role === "超級管理員";
  const moduleCan = (module: string, action: "view" | "edit", operation: PermissionKey) =>
    Boolean(
      (admin?.modulePermissions as Record<string, Record<string, boolean>> | undefined)?.[module]?.[action]
      ?? admin?.role === "超級管理員",
    ) && can(operation);
  const load = async (name = active) => {
    setBusy(true);
    setError("");
    try {
      if (name === "營運概覽") {
        const result = await api.get("/api/dashboard");
        setDash(result.data);
        setRows([]);
      } else if (name === "收入報表") {
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
      } else if (name === "系統設定" || name === "通知管理" || name === "代辦事項") {
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
  const boot = async (showError = false) => {
    setBusy(true);
    if (showError) setError("");
    try {
      const r = await api.get("/api/bootstrap");
      setAdmin(r.data.admin);
      setSigned(true);
      await load("營運概覽");
    } catch (e) {
      setSigned(false);
      setAdmin(null);
      if (showError) setError(e instanceof Error ? e.message : "無法載入後台");
    } finally { setBusy(false); }
  };
  useEffect(() => { void boot(false); }, []);
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
      await api.post("/api/admin-login", { account: loginAccount, password: loginPassword });
      setLoginPassword("");
      await boot(true);
    } catch (e) { setError(e instanceof Error ? e.message : "登入失敗"); }
  };
  const setupOwnerCredential = async () => {
    setError("");
    if (!loginPassword) { setError("請先輸入要設定的管理員密碼"); return; }
    try {
      const result = await auth.signIn();
      const account = String(result.user.email || "");
      await api.post("/api/admin-credential-bootstrap", { password: loginPassword });
      await auth.signOut();
      setLoginAccount(account);
      await api.post("/api/admin-login", { account, password: loginPassword });
      setLoginPassword("");
      await boot(true);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === "popup_blocked" ? "瀏覽器阻擋登入視窗" : code === "popup_closed" ? "已取消登入" : e instanceof Error ? e.message : "首次設定失敗");
    }
  };
  const signOut = async () => {
    await api.post("/api/admin-logout");
    setSigned(false);
    setAdmin(null);
  };
  const openProfileName = () => {
    setProfileName(String(admin?.name || ""));
    setShowProfileName(true);
  };
  const saveProfileName = async () => {
    await runConfirmed(
      () => requestConfirmation({ title: "確認修改名稱", message: `管理員名稱將修改為「${profileName.trim() || "未填寫"}」`, confirmLabel: "確認修改" }),
      async () => {
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
      },
    );
  };
  const fields = useMemo(() => labels[tableMap[active]] || [], [active]);
  const openActivationCodeForm = () => {
    setForm({ durationType: isSuper ? "30_days" : "7_days", quantity: "10" });
    setShowForm(true);
  };
  const batchCodes = async () => {
    const durationType = form.durationType || (isSuper ? "30_days" : "7_days");
    const quantity = Number(form.quantity || "10");
    await runConfirmed(
      () => requestConfirmation({ title: "確認建立啟動碼", message: `將建立 ${quantity} 組啟動碼。`, confirmLabel: "確認建立" }),
      async () => {
        setBusy(true);
        try {
          await api.post("/api/activation-codes/batch", { durationType, quantity });
          setShowForm(false);
          setForm({});
          await load(active);
        } catch (e) {
          setError(e instanceof Error ? e.message : "批次建立失敗");
        } finally {
          setBusy(false);
        }
      },
    );
  };
  const deleteCode = async (id: string) => {
    const code = rows.find((row) => row.id === id)?.code;
    await runConfirmed(
      () => requestConfirmation({
        title: "確認刪除啟動碼",
        message: `啟動碼「${text(code)}」刪除後無法復原。`,
        confirmLabel: "確認刪除",
        tone: "danger",
      }),
      async () => {
        setBusy(true);
        setError("");
        try {
          await deleteActivationCode(api, id);
          await load("啟動碼管理");
        } catch (e) {
          setError(e instanceof Error ? e.message : "刪除啟動碼失敗");
        } finally {
          setBusy(false);
        }
      },
    );
  };
  const saveAdmin = async () => {
    await runConfirmed(
      () => requestConfirmation({
        title: editingAdmin ? "確認修改管理員" : "確認新增管理員",
        message: `${adminForm.account || "未填寫帳號"}／${adminForm.name || "未填寫名稱"}／${adminForm.role}`,
        confirmLabel: editingAdmin ? "確認修改" : "確認新增",
      }),
      async () => {
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
      },
    );
  };
  const editAdmin = (r: Row) => {
    const p = (r.permissions || {}) as Record<string, boolean>;
    setAdminForm({
      account: String(r.account || ""),
      name: String(r.name || ""),
      password: "",
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
    await runConfirmed(
      () => requestConfirmation({ title: "確認刪除管理員", message: "刪除後將無法使用此管理員帳號。", confirmLabel: "確認刪除", tone: "danger" }),
      async () => {
        setBusy(true);
        try {
          await api.delete(`/api/admins/${id}`);
          await load("管理員權限");
        } catch (e) {
          setError(e instanceof Error ? e.message : "刪除管理員失敗");
        } finally {
          setBusy(false);
        }
      },
    );
  };
  const resetRevenue = async () => {
    await runConfirmed(
      () => requestConfirmation({
        title: "確認重設收入",
        message: "五項收入將歸零，付款紀錄仍會保留。",
        confirmLabel: "確認重設",
        tone: "danger",
      }),
      async () => {
        setBusy(true);
        setError("");
        try {
          await api.post("/api/revenue/reset");
          await load("收入報表");
        } catch (e) {
          setError(e instanceof Error ? e.message : "收入重設失敗");
        } finally {
          setBusy(false);
        }
      },
    );
  };
  const roleChange = (role: string) => setAdminForm((current) => ({
    ...current,
    role,
    permissions: defaultOperationPermissions(role),
  }));
  if (!signed)
    return (
      <div className="login">
        <div className="loginCard">
          <div className="brand">樂彩 Matrix</div>
          <h1>營運後台</h1>
          <p>管理員登入</p>
          <div className="adminLoginForm">
            <label>管理員帳號<input autoComplete="username" value={loginAccount} onChange={(event) => setLoginAccount(event.target.value)} /></label>
            <label>密碼<input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
            <button onClick={signIn} disabled={busy}>登入營運後台</button>
            <button className="credentialSetupButton" onClick={setupOwnerCredential} disabled={busy}>超級管理員首次設定</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  return (
    <div className="shell">
      {drawer && <button className="drawerBackdrop" aria-label="關閉功能選單" onClick={() => setDrawer(false)} />}
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
          {active === "營運概覽" && dash && <Overview d={dash} />}{" "}
          {active === "收入報表" && dash && <Revenue d={dash} isSuper={Boolean(isSuper)} onReset={resetRevenue} busy={busy} />}{" "}
          {active === "系統設定" && <SystemSettings canEdit={can("edit")} />}{" "}
          {active === "通知管理" && <NotificationManagement client={api} canEdit={can("edit")} />}{" "}
          {active === "代辦事項" && admin && (
            <AdminTodos
              client={api}
              admin={{ id: String(admin.id ?? ""), role: String(admin.role ?? "") }}
              requestConfirmation={requestConfirmation}
            />
          )}{" "}
          {active === "用戶管理" && (
            <UserManager
              rows={rows}
              canEdit={moduleCan("users", "edit", "edit")}
              onStatus={async (id, status) => {
                await runConfirmed(
                  () => requestConfirmation({
                    title: status === "disabled" ? "確認停權用戶" : "確認啟動用戶",
                    message: `LINE 用戶 ${id}`,
                    confirmLabel: status === "disabled" ? "確認停權" : "確認啟動",
                    tone: status === "disabled" ? "danger" : "default",
                  }),
                  async () => {
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
                  },
                );
              }}
            />
          )}{" "}
          {active === "訂閱管理" && (
            <SubscriptionManager
              rows={rows}
              plans={plans}
              transfers={transfers}
              canEdit={moduleCan("subscriptions", "edit", "edit")}
              onSubscription={async (id, payload) => {
                return runConfirmed(
                  () => requestConfirmation({ title: "確認修改訂閱", message: `會員 ${id} 的訂閱資料將更新。`, confirmLabel: "確認修改" }),
                  async () => {
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
                  },
                );
              }}
              onTransfer={async (id, decision) => {
                await runConfirmed(
                  () => requestConfirmation({
                    title: decision === "confirmed" ? "確認通過轉帳" : "確認拒絕轉帳",
                    message: `轉帳申請 ${id}`,
                    confirmLabel: decision === "confirmed" ? "確認通過" : "確認拒絕",
                    tone: decision === "rejected" ? "danger" : "default",
                  }),
                  async () => {
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
                  },
                );
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
                {active === "啟動碼管理" && moduleCan("activationCodes", "edit", "add") && (
                    <button
                      className="primary activationCodeAddButton"
                      onClick={() => showForm ? setShowForm(false) : openActivationCodeForm()}
                    >
                      <Plus size={15} />
                      新增
                    </button>
                  )}
              </div>
              {showForm && active === "啟動碼管理" && (
                <div className="formCard activationCodeFormCard">
                  <h3>建立啟動碼</h3>
                  <div className="activationCodeFormGrid">
                    <label>
                      啟動期限
                      <select
                        value={form.durationType || (isSuper ? "30_days" : "7_days")}
                        onChange={(e) => setForm({ ...form, durationType: e.target.value })}
                      >
                        <option value="7_days">7 天</option>
                        <option value="15_days">15 天</option>
                        {isSuper && (
                          <>
                            <option value="30_days">30 天</option>
                            <option value="60_days">60 天</option>
                            <option value="90_days">90 天</option>
                            <option value="365_days">365 天</option>
                            <option value="lifetime">永久</option>
                          </>
                        )}
                      </select>
                    </label>
                    <label>
                      建立數量
                      <select value={form.quantity || "10"} onChange={(e) => setForm({ ...form, quantity: e.target.value })}>
                        <option value="1">1</option>
                        <option value="3">3</option>
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="20">20</option>
                      </select>
                    </label>
                  </div>
                  <div className="formActions activationCodeFormActions">
                    <button onClick={() => setShowForm(false)}>取消</button>
                    <button className="primary activationCodeCreateButton" onClick={batchCodes} disabled={busy}>
                      建立
                    </button>
                  </div>
                </div>
              )}
              <DataTable
                rows={rows}
                fields={fields}
                canDelete={active === "啟動碼管理" && moduleCan("activationCodes", "edit", "delete")}
                onDelete={deleteCode}
              />
            </>
          )}
        </section>
        {confirmation && (
          <ConfirmationDialog
            request={confirmation}
            onCancel={() => finishConfirmation(false)}
            onConfirm={() => finishConfirmation(true)}
          />
        )}
      </main>
    </div>
  );
}

function ConfirmationDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConfirmationRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modalBackdrop confirmationBackdrop" role="presentation">
      <div className="confirmationDialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
        <h2 id="confirmation-title">{request.title}</h2>
        <p id="confirmation-message">{request.message}</p>
        <div className="formActions">
          <button onClick={onCancel}>取消</button>
          <button className={request.tone === "danger" ? "confirmDanger" : "primary"} onClick={onConfirm}>{request.confirmLabel}</button>
        </div>
      </div>
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
  const [page, setPage] = useState(1);
  const filtered = filterRows(rows, keyword, status);
  const paged = paginateRows(filtered, page);
  const fields = ["lineDisplayName", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "authUserId"];
  const statusText = (value: unknown) => String(value) === "disabled" || String(value) === "停用" ? "停用" : "啟用";
  const showValue = (field: string, row: Row) => field === "status"
    ? statusText(row[field])
    : field === "recentOnlineMinutes" ? `${Number(row[field] || 0)} 分鐘` : displayValue(field, row[field]);
  return (
    <>
      <div className="managementToolbar">
        <input aria-label="搜尋會員" placeholder="搜尋會員、方案、推薦碼或邀請碼" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
        <select aria-label="篩選會員狀態" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">全部狀態</option>
          <option value="active">啟用</option>
          <option value="disabled">停用</option>
        </select>
        <span>{filtered.length} 筆資料</span>
      </div>
      <div className="managementList tableWrap">
        <table>
          <thead><tr>{fields.map((field) => <th key={field}>{zh[field] || field}</th>)}<th>操作</th></tr></thead>
          <tbody>{paged.items.length === 0 ? <tr><td colSpan={fields.length + 1} className="empty">目前沒有資料</td></tr> : paged.items.map((row) => (
            <tr key={row.id}>
              {fields.map((field) => <td key={field}>{showValue(field, row)}</td>)}
              <td>{canEdit && <button className="compactButton" onClick={() => onStatus(row.id, statusText(row.status) === "停用" ? "active" : "disabled")}>{statusText(row.status) === "停用" ? "啟動" : "停權"}</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Pagination page={paged.currentPage} totalPages={paged.totalPages} onPage={setPage} />
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
  onSubscription: (id: string, payload: SubscriptionPayload) => Promise<boolean>;
  onTransfer: (id: string, decision: "confirmed" | "rejected") => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [action, setAction] = useState<SubscriptionPayload["action"]>("activate");
  const [planId, setPlanId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [page, setPage] = useState(1);
  const [userInfo, setUserInfo] = useState<Row | null>(null);
  const filtered = filterRows(rows, keyword, status);
  const paged = paginateRows(filtered, page);
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
    const saved = await onSubscription(editing.id, payload);
    if (saved) setEditing(null);
  };
  const actionText: Record<SubscriptionPayload["action"], string> = {
    activate: "開通", renew: "續訂", cancel: "取消續訂", adjustExpiry: "調整到期日", lifetime: "設為終生",
  };
  return (
    <>
      <div className="managementToolbar">
        <input aria-label="搜尋訂閱" placeholder="搜尋會員或方案" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
        <select aria-label="篩選訂閱狀態" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">全部狀態</option><option value="active">啟用</option><option value="disabled">停用</option>
        </select>
        <span>{filtered.length} 筆資料</span>
      </div>
      <div className="managementList tableWrap">
        <table>
          <thead><tr><th>LINE名稱</th><th>訂閱方案</th><th>開始時間</th><th>到期時間</th><th>自動續訂</th><th>調整到期日</th><th>用戶資訊</th></tr></thead>
          <tbody>{paged.items.length === 0 ? <tr><td colSpan={7} className="empty">目前沒有資料</td></tr> : paged.items.map((row) => (
            <tr key={row.id}>
              <td>{text(row.lineDisplayName)}</td><td>{text(row.planName)}</td><td>{formatAdminDateTime(row.planStartedAt)}</td><td>{row.isLifetime ? "終生" : formatAdminDateTime(row.planExpiresAt)}</td><td>{row.autoRenew ? "是" : "否"}</td>
              <td>{canEdit && <button className="compactButton" onClick={() => open(row, "adjustExpiry")}>調整到期日</button>}</td>
              <td><button className="compactButton" onClick={() => setUserInfo(row)}>用戶資訊</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Pagination page={paged.currentPage} totalPages={paged.totalPages} onPage={setPage} />
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
      {userInfo && <UserInfoDialog row={userInfo} onClose={() => setUserInfo(null)} />}
      <div className="panel transferPanel">
        <h2>轉帳申請</h2>
        {transfers.length === 0 ? <div className="empty">目前沒有資料</div> : transfers.map((row) => (
          <div className="transferRow" key={row.id}>
            <div><b>{text(row.lineDisplayName)}</b><span>{text(row.planName)}／{money(Number(row.amount))}／末五碼 {text(row.accountLastFive)}</span></div>
            <span>{text(row.status)}</span>
            {canEdit && row.status === "pending" && <div className="transferActions"><button onClick={() => onTransfer(row.id, "confirmed")}>確認</button><button className="transferReject" onClick={() => onTransfer(row.id, "rejected")}>拒絕</button></div>}
          </div>
        ))}
      </div>
    </>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return (
    <div className="pagination" aria-label="分頁">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>上一頁</button>
      <span>第 {page}／{totalPages} 頁</span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一頁</button>
    </div>
  );
}

function UserInfoDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const statusText = ["disabled", "停用", "inactive"].includes(String(row.status)) ? "停用" : "啟用";
  const values: Array<[string, string]> = [
    ["LINE名稱", text(row.lineDisplayName)],
    ["註冊時間", formatAdminDateTime(row.registeredAt)],
    ["最後上線時間", formatAdminDateTime(row.lastOnlineAt)],
    ["近3日在線時間", `${Number(row.recentOnlineMinutes || 0)} 分鐘`],
    ["狀態", statusText],
    ["驗證用戶ID", text(row.authUserId)],
  ];
  return (
    <div className="modalBackdrop" role="presentation">
      <div className="operationDialog" role="dialog" aria-modal="true" aria-labelledby="user-info-title">
        <h2 id="user-info-title">用戶資訊</h2>
        <div className="userInfoRows">{values.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        <div className="formActions"><button className="primary" onClick={onClose}>關閉</button></div>
      </div>
    </div>
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
              {editing ? "新密碼（留空不變）" : "初始密碼"}
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
          <div className="permissionBox">
            <b>操作權限</b>
            {permissionEntries.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={form.role === "超級管理員" || form.permissions[key]}
                  disabled={form.role === "超級管理員"}
                  onChange={(event) => setForm({
                    ...form,
                    permissions: { ...form.permissions, [key]: event.target.checked },
                  })}
                />
                {label}
              </label>
            ))}
            <span>{roleDescription[form.role]}</span>
          </div>
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
                    <td>{formatAdminDateTime(r.lastLoginAt)}</td>
                    <td>{permissionEntries
                      .filter(([key]) => Boolean((r.permissions as Record<string, boolean> | undefined)?.[key]))
                      .map(([, label]) => label)
                      .join("、") || "無"}</td>
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
function Overview({ d }: { d: Dashboard }) {
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
    </>
  );
}
function Revenue({
  d,
  isSuper,
  onReset,
  busy,
}: {
  d: Dashboard;
  isSuper: boolean;
  onReset: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <>
      {isSuper && (
        <div className="revenueActions">
          <button
            className="compactButton revenueResetButton"
            onClick={onReset}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "重設中…" : "重設收入"}
          </button>
        </div>
      )}
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
function SystemSettings({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<SystemStatusItem[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [checking, setChecking] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [refreshingId, setRefreshingId] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ id: string; outcome: Exclude<SystemStatusActionOutcome, "failure"> } | null>(null);
  const requestInFlight = useRef(false);
  const statusSectionRef = useRef<HTMLElement | null>(null);
  const refresh = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setChecking(true);
    setStatusError("");
    setStatusNotice("");
    try {
      const result = await loadSystemStatus(api);
      setItems(result.items);
      setCheckedAt(result.checkedAt);
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "連線狀態檢查失敗");
    } finally {
      requestInFlight.current = false;
      setChecking(false);
    }
  };
  const retry = async (id: string) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRetryingId(id);
    setStatusError("");
    setStatusNotice("");
    try {
      const next = await retrySystemStatus(api, id);
      setItems((current) => current.map((item) => item.id === id ? next : item));
      setCheckedAt(next.checkedAt);
      setStatusNotice(`${next.name} 重新呼叫完成，API 連線${next.ok ? "正常" : "仍為異常"}`);
      setFocusRequest({ id, outcome: "success" });
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "API 重新呼叫失敗");
    } finally {
      requestInFlight.current = false;
      setRetryingId("");
    }
  };
  const refreshCrawler = async (item: SystemStatusItem) => {
    if (requestInFlight.current || !canRefreshCrawler(item, canEdit)) return;
    requestInFlight.current = true;
    setRefreshingId(item.id);
    setStatusError("");
    setStatusNotice("");
    try {
      const result = await refreshCrawlerSystemStatus(api, item.id);
      setStatusNotice(`${result.lottery} 已手動更新至 ${result.period} 期`);
      try {
        const next = await loadSystemStatus(api);
        setItems(next.items);
        setCheckedAt(next.checkedAt);
        setFocusRequest({ id: item.id, outcome: "success" });
      } catch {
        setStatusError("開獎資料已更新，但狀態重新檢查失敗");
        setFocusRequest({ id: item.id, outcome: "partial-success" });
      }
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "開獎資料手動更新失敗");
    } finally {
      requestInFlight.current = false;
      setRefreshingId("");
    }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!focusRequest) return;
    focusSystemStatusAfterAction(statusSectionRef.current, focusRequest.id, focusRequest.outcome);
    setFocusRequest(null);
  }, [focusRequest, items]);
  const actionPending = checking || Boolean(retryingId) || Boolean(refreshingId);
  return (
    <section ref={statusSectionRef} className="systemStatusSection" aria-labelledby="system-status-title" tabIndex={-1}>
      <header className="systemStatusHeader">
        <div><h2 id="system-status-title">連線狀態</h2><span>最後檢查時間：{checkedAt ? formatAdminDateTime(checkedAt) : "尚未檢查"}</span></div>
        <button className="compactButton" onClick={refresh} disabled={actionPending} aria-busy={checking}><RefreshCw size={15} />{checking ? "檢查中…" : "重新檢查全部服務"}</button>
      </header>
      {statusError && <div className="error" role="alert">{statusError}</div>}
      {statusNotice && <div className="systemStatusNotice" role="status">{statusNotice}</div>}
      {items.length === 0 && <div className="statusEmpty">{checking ? "正在檢查服務狀態…" : "目前沒有服務狀態"}</div>}
      <div className="statusGroups">
        {groupSystemStatusItems(items).map((group) => {
          const healthyCount = group.items.filter((item) => item.ok).length;
          const groupTitleId = `status-group-${group.location.toLowerCase()}`;
          return (
            <section className="statusGroup" key={group.location} aria-labelledby={groupTitleId}>
              <header className="statusGroupHeader">
                <h3 id={groupTitleId}>{group.location}</h3>
                <span>{healthyCount}／{group.items.length} 正常</span>
              </header>
              <div className="statusRows">
                {group.items.map((item) => {
                  const detail = item.detail && typeof item.detail === "object" && !Array.isArray(item.detail)
                    ? item.detail as Record<string, unknown>
                    : null;
                  const finishedAt = detail?.finishedAt ?? detail?.finished_at;
                  return (
                    <article className="statusRow" key={item.id} data-status-id={item.id} tabIndex={-1} aria-label={`${item.name}：${item.ok ? "正常" : "異常"}`}>
                      <div className="statusRowMain">
                        <div className="statusRowTitle">
                          <div className="statusIdentity"><b>{item.name}</b><span>{item.group}</span></div>
                          <div className="statusState"><span>{item.location === "GitHub" ? "API 連線" : "狀態"}</span><b className={item.ok ? "statusBadge good" : "statusBadge bad"}>{item.ok ? "正常" : "異常"}</b></div>
                        </div>
                        <dl className="statusFacts">
                          <div><dt>用途</dt><dd>{item.description}</dd></div>
                          <div><dt>Endpoint</dt><dd className="statusEndpoint">{item.endpoint}</dd></div>
                          <div><dt>檢查時間</dt><dd>{formatAdminDateTime(item.checkedAt)}</dd></div>
                          <div><dt>回應時間</dt><dd>{item.responseMs} ms</dd></div>
                          {getGithubStatusFacts(item).map((fact) => (
                            <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.format === "date" ? formatAdminDateTime(fact.value) : text(fact.value)}</dd></div>
                          ))}
                          {detail?.status !== undefined && <div><dt>狀態</dt><dd>{text(detail.status)}</dd></div>}
                          {finishedAt !== undefined && <div><dt>排程完成時間</dt><dd>{formatAdminDateTime(finishedAt)}</dd></div>}
                          {item.id === "appdeploy-watchdog-heartbeat" && (
                            <>
                              <div><dt>心跳完成時間</dt><dd>{formatAdminDateTime(detail?.completedAt)}</dd></div>
                              <div><dt>實體排程</dt><dd>每 6 分鐘</dd></div>
                              <div><dt>Logical 排程</dt><dd>6×50、10×60、30×18</dd></div>
                            </>
                          )}
                        </dl>
                        {item.error && <div className="statusErrorText">{item.error}</div>}
                      </div>
                      {(canRetrySystemStatus(item) || canRefreshCrawler(item, canEdit)) && (
                        <div className="statusRowActions">
                          {canRetrySystemStatus(item) && (
                            <button className="compactButton statusRetryButton" onClick={() => retry(item.id)} disabled={actionPending} aria-busy={retryingId === item.id}>
                              <RefreshCw size={14} />{retryingId === item.id ? "呼叫 Railway 中…" : "重新呼叫 Railway"}
                            </button>
                          )}
                          {canRefreshCrawler(item, canEdit) && (
                            <button className="compactButton statusManualRefreshButton" onClick={() => refreshCrawler(item)} disabled={actionPending} aria-busy={refreshingId === item.id}>
                              <RefreshCw size={14} />{refreshingId === item.id ? "更新開獎資料中…" : "手動更新開獎資料"}
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
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
              <td colSpan={fields.length + (canDelete ? 1 : 0)} className="empty">
                目前沒有資料
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                {fields.map((f) => (
                  <td key={f}>{displayValue(f, r[f])}</td>
                ))}
                {canDelete && (
                  <td>
                    <button className="danger" aria-label={`刪除啟動碼 ${text(r.code)}`} onClick={() => onDelete(r.id)}>
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
