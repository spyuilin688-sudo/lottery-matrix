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
  const can = (k: string) =>
    Boolean(
      (admin?.permissions as Record<string, boolean> | undefined)?.[k] ??
        admin?.role === "超級管理員",
    );
  const isSuper = admin?.role === "超級管理員";
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
      } else if (name === "系統設定" || name === "管理員權限") {
        const r = await api.get("/api/data/admins");
        setRows(r.data.items || []);
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
            <small>{String(admin?.name || admin?.account || "管理員")}</small>
          </div>
          <div className="actions">
            <button onClick={() => load()} title="重新整理">
              <RefreshCw size={18} />
            </button>
            <button onClick={signOut} title="登出">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <section className="content">
          {error && <div className="error">{error}</div>}
          {busy && <div className="loading">資料處理中…</div>}
          {active === "營運概覽" && dash && (
            <Overview d={dash} algorithmStatus={algorithmStatus} />
          )}{" "}
          {active === "數據分析" && dash && <Analytics d={dash} />}{" "}
          {active === "收入報表" && dash && <Revenue d={dash} />}{" "}
          {active === "系統設定" && <SystemSettings rows={rows} />}{" "}
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
          {tableMap[active] && (
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
  const setP = (k: keyof AdminForm["permissions"], v: boolean) =>
    setForm({ ...form, permissions: { ...form.permissions, [k]: v } });
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
          <div className="permissionBox">
            <b>權限</b>
            {(["view", "add", "edit", "delete"] as const).map((k, i) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={
                    form.role === "超級管理員" ? true : form.permissions[k]
                  }
                  disabled={form.role === "超級管理員"}
                  onChange={(e) => setP(k, e.target.checked)}
                />
                {["查看", "新增", "修改", "刪除"][i]}
              </label>
            ))}
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
              <th>查看</th>
              <th>新增</th>
              <th>修改</th>
              <th>刪除</th>
              {isSuper && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty">
                  目前沒有資料
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const p = (r.permissions || {}) as Record<string, boolean>;
                return (
                  <tr key={r.id}>
                    <td>{text(r.account)}</td>
                    <td>{text(r.name)}</td>
                    <td>{text(r.role)}</td>
                    <td>{text(r.status)}</td>
                    <td>{text(r.lastLoginAt)}</td>
                    {["view", "add", "edit", "delete"].map((k) => (
                      <td key={k}>
                        {r.role === "超級管理員" || p[k] ? "是" : "否"}
                      </td>
                    ))}
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
function SystemSettings({ rows }: { rows: Row[] }) {
  return (
    <div className="panel">
      <h2>系統設定</h2>
      <div className="settingRows">
        <div>
          <b>管理員帳號管理</b>
          <span>{rows.length} 個管理員帳號</span>
        </div>
        <div>
          <b>管理員密碼修改</b>
          <span>由登入帳號提供者管理</span>
        </div>
        <div>
          <b>後台登入安全設定</b>
          <span>登入驗證已啟用</span>
        </div>
        <div>
          <b>操作日誌查看</b>
          <span>請至「審計日誌」查看</span>
        </div>
      </div>
    </div>
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
