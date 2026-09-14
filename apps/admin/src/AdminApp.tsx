import { loadAdminBootstrap, createActivationBatchSubmitter } from "./admin-recovery";
import { useAdminMemberPage } from "./use-admin-member-page";
import { useAdminDataPage, type AdminDataPageController } from "./use-admin-data-page";
import { AdminListControls } from "./AdminListControls";
import { readAdminDataPage } from "./admin-table-pagination";
import { adminBusinessDateKey } from "../shared/admin-business-time";
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
  ToggleLeft,
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
import { UserInfoDialog } from "./UserInfoDialog";
import "./profile-name.css";
import "./admin-operations.css";
import "./system-status.css";
import { RailwayOperations } from './RailwayOperations';
import { saveOwnAdminName } from "./admin-profile";
import { deleteActivationCode, formatAdminDateTime, saveMemberStatus, saveSubscription } from "./admin-operations";
import { runConfirmed } from "./admin-confirmation";
import {
  canRefreshCrawler,
  canRetrySystemStatus,
  focusSystemStatusAfterAction,
  getGithubStatusFacts,
  getServiceEvidenceFacts,
  getMatrixStorageFacts,
  getSystemStatusPresentation,
  formatSystemStatusValue,
  groupSystemStatusItems,
  loadSystemStatus,
  refreshCrawlerSystemStatus,
  retrySystemStatus,
  type SystemStatusActionOutcome,
  type SystemStatusItem,
} from "./system-status";
import { NotificationManagement } from "./NotificationManagement";
import { AdminTransferPush } from "./AdminTransferPush";
import { AdminTodos } from "./AdminTodos";
import { PaymentReversalPanel, type PaymentRecord, type PaymentReversalStatus } from "./PaymentReversalPanel";
import { PermissionSwitches } from "./PermissionSwitches";
type Row = Record<string, unknown> & { id: string };
type Dashboard = {
  todayVisitors: number | null;
  monthVisitors: number | null;
  totalVisitors: number | null;
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
  ["權限切換", ToggleLeft],
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
    "estimatedRegion",
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
    "redeemedByLineDisplayName",
    "redeemedAt",
    "expiresAt",
    "batchId",
  ],
};
const zh: Record<string, string> = {
  recentIp: "最近連線IP",
  estimatedRegion: "推估地區",
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
  redeemedByLineDisplayName: "兌換會員",
  redeemedAt: "兌換時間",
  expiresAt: "到期時間",
  batchId: "批次",
};
const money = (n: number) => `$${Number(n || 0).toLocaleString("zh-TW")}`;
const text = (v: unknown) =>
  typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—");
const dateFields = new Set(["registeredAt", "planStartedAt", "planExpiresAt", "loginAt", "logoutAt", "operationTime", "paidAt", "createdAt", "redeemedAt", "expiresAt", "lastLoginAt", "lastOnlineAt"]);
const displayValue = (field: string, value: unknown) => dateFields.has(field) ? formatAdminDateTime(value) : text(value);
const redeemedActivationCode = (row: Row) => row.status === "used" || Boolean(row.redeemedAt || row.redeemedByLineDisplayName);
const paymentRecord = (row: Row): PaymentRecord => ({
  id: row.id,
  memberId: String(row.memberId ?? ""),
  lineDisplayName: typeof row.lineDisplayName === "string" ? row.lineDisplayName : null,
  planId: typeof row.planId === "string" ? row.planId : null,
  planName: typeof row.planName === "string" ? row.planName : null,
  amount: Number(row.amount ?? 0),
  paidAt: typeof row.paidAt === "string" ? row.paidAt : null,
  status: String(row.status ?? ""),
  reversedAt: typeof row.reversedAt === "string" ? row.reversedAt : null,
  reversalReason: typeof row.reversalReason === "string" ? row.reversalReason : null,
  reversedByName: typeof row.reversedByName === "string" ? row.reversedByName : null,
});

async function writeClipboardText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("COPY_FAILED");
  }
}
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
  const [bootstrapUnavailable, setBootstrapUnavailable] = useState(false);
  const activationBatchSubmitter = useRef(createActivationBatchSubmitter(api));
  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [admin, setAdmin] = useState<Record<string, unknown> | null>(null);
  const [active, setActive] = useState("營運概覽");

  const [memberListRevision, setMemberListRevision] = useState(0);
  const [plans, setPlans] = useState<Row[]>([]);

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
  const [activationSelectionMode, setActivationSelectionMode] = useState(false);
  const [selectedActivationCodeIds, setSelectedActivationCodeIds] = useState<Set<string>>(new Set());
  const [activationCopyFeedback, setActivationCopyFeedback] = useState("");
  const activationCopyFeedbackTimer = useRef<number | null>(null);
  const loadVersion = useRef(0);
  const loadPending = useRef(false);
  const viewVersion = useRef(0);
  const bootVersion = useRef(0);
  const authVersion = useRef(0);
  const authPending = useRef(false);
  const confirmationRef = useRef<ConfirmationRequest | null>(null);
  confirmationRef.current = confirmation;
  const mounted = useRef(true);
  const activeRef = useRef(active);
  const signedRef = useRef(signed);
  const adminIdRef = useRef(String(admin?.id ?? ""));
  activeRef.current = active;
  signedRef.current = signed;
  adminIdRef.current = String(admin?.id ?? "");
  const requestConfirmation = (request: Omit<ConfirmationRequest, "resolve">) => {
    const current = captureView();
    confirmationRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const pending = { ...request, resolve: (confirmed: boolean) => resolve(confirmed && current()) };
      confirmationRef.current = pending;
      setConfirmation(pending);
    });
  };
  const finishConfirmation = (confirmed: boolean) => {
    confirmationRef.current?.resolve(confirmed);
    confirmationRef.current = null;
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
  const sessionKey = signed ? String(admin?.id ?? "") : "";
  const mainTable = active === "管理員權限" ? "admins" : tableMap[active];
  const listPage = useAdminDataPage(signed && mainTable && !["users", "subscriptions"].includes(mainTable) ? mainTable : null, memberListRevision, api, sessionKey);
  const paymentPage = useAdminDataPage(signed && active === "訂閱管理" ? "subscriptionRecords" : null, memberListRevision, api, sessionKey);
  const transferPage = useAdminDataPage(signed && active === "訂閱管理" ? "transferRequests" : null, memberListRevision, api, sessionKey);
  const rows = listPage.items;
  const captureView = (trackRead = false) => {
    const read = loadVersion.current;
    const view = viewVersion.current;
    const adminId = adminIdRef.current;
    const name = activeRef.current;
    return () => mounted.current && view === viewVersion.current && adminId === adminIdRef.current && name === activeRef.current && (!trackRead || read === loadVersion.current);
  };
  const load = async (name = activeRef.current, expectedAdminId = adminIdRef.current) => {
    if (!mounted.current || !signedRef.current || name !== activeRef.current || expectedAdminId !== adminIdRef.current) return;
    const version = ++loadVersion.current;
    loadPending.current = true;
    const validView = captureView();
    const current = () => validView() && signedRef.current && version === loadVersion.current;
    setMemberListRevision(value => value + 1);
    setBusy(true);
    setError("");
    setDash(null);
    setPlans([]);
    try {
      if (name === "營運概覽" || name === "收入報表") {
        const result = await api.get("/api/dashboard");
        if (current()) setDash(result.data);
      } else if (name === "訂閱管理") {
        // Plans are form options: read every bounded server page instead of silently truncating.
        const options: Row[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const result = await api.get(`/api/data/plans?page=${page}`);
          if (!current()) return;
          const resultPage = readAdminDataPage(result.data);
          if (resultPage.currentPage !== page || (resultPage.total > 0 && resultPage.items.length === 0)) {
            throw new Error("方案列表分頁資料不完整，請重新載入");
          }
          options.push(...resultPage.items);
          totalPages = resultPage.totalPages;
          page = resultPage.currentPage + 1;
        } while (page <= totalPages);
        if (current()) setPlans(options);
      }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "資料讀取失敗");
    } finally {
      if (current()) { loadPending.current = false; setBusy(false); }
    }
  };
  const boot = async (showError = false) => {
    const version = ++bootVersion.current;
    const validView = captureView();
    const current = () => mounted.current && version === bootVersion.current && validView();
    setBusy(true);
    if (showError) setError("");
    try {
      const bootstrap = await loadAdminBootstrap(api);
      if (!current()) return;
      if (bootstrap.kind !== 'ready') {
        setBootstrapUnavailable(bootstrap.kind === 'unavailable');
        if (bootstrap.kind === 'unauthorized') {
          signedRef.current = false;
          adminIdRef.current = "";
          setSigned(false);
          setAdmin(null);
        }
        if (showError || bootstrap.kind === 'unavailable') setError(bootstrap.message);
        return;
      }
      setBootstrapUnavailable(false);
      const r = { data: { admin: bootstrap.admin } };
      const initialAdminId = String(r.data.admin?.id ?? "");
      setAdmin(r.data.admin);
      setSigned(true);
      const initial = window.location.hash === "#transfer-requests" && r.data.admin?.role === "超級管理員" ? "訂閱管理" : "營運概覽";
      signedRef.current = true;
      adminIdRef.current = initialAdminId;
      activeRef.current = initial;
      setActive(initial);
      await load(initial, initialAdminId);
    } catch (e) {
      if (current()) { setBootstrapUnavailable(true); setError(e instanceof Error ? e.message : "無法載入後台"); }
    } finally { if (mounted.current && version === bootVersion.current && !signedRef.current) setBusy(false); }
  };
  useEffect(() => {
    mounted.current = true;
    void boot(false);
    return () => { mounted.current = false; viewVersion.current += 1; loadVersion.current += 1; bootVersion.current += 1; authVersion.current += 1; confirmationRef.current?.resolve(false); };
  }, []);
  useEffect(() => () => {
    if (activationCopyFeedbackTimer.current !== null) window.clearTimeout(activationCopyFeedbackTimer.current);
  }, []);
  const clearActivationSelection = () => {
    if (activationCopyFeedbackTimer.current !== null) window.clearTimeout(activationCopyFeedbackTimer.current);
    activationCopyFeedbackTimer.current = null;
    setActivationSelectionMode(false);
    setSelectedActivationCodeIds(new Set());
    setActivationCopyFeedback("");
  };
  const choose = (name: string) => {
    viewVersion.current += 1;
    loadVersion.current += 1;
    bootVersion.current += 1;
    activeRef.current = name;
    confirmationRef.current?.resolve(false);
    confirmationRef.current = null;
    setConfirmation(null);
    clearActivationSelection();
    setActive(name);
    setDrawer(false);
    setShowForm(false);
    setEditingAdmin(null);
    void load(name);
  };
  useEffect(() => {
    if (!signed || !isSuper) return;
    const openTransfers = () => { if (window.location.hash === "#transfer-requests") choose("訂閱管理"); };
    window.addEventListener("hashchange", openTransfers);
    return () => window.removeEventListener("hashchange", openTransfers);
  }, [signed, isSuper]);
  useEffect(() => {
    if (signed && active === "訂閱管理" && window.location.hash === "#transfer-requests") document.getElementById("transfer-requests")?.scrollIntoView?.({ block: "start" });
  }, [signed, active, busy]);
  const runAuthentication = async (operation: (current: () => boolean) => Promise<void>) => {
    if (authPending.current) return;
    authPending.current = true;
    const version = ++authVersion.current;
    const current = () => mounted.current && version === authVersion.current;
    setBusy(true);
    setError("");
    try { await operation(current); }
    catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "登入失敗"); }
    finally { authPending.current = false; if (current() && !loadPending.current) setBusy(false); }
  };
  const signIn = () => runAuthentication(async current => {
    await api.post("/api/admin-login", { account: loginAccount, password: loginPassword });
    if (!current()) return;
    setLoginPassword("");
    await boot(true);
  });
  const setupOwnerCredential = () => runAuthentication(async current => {
    if (!loginPassword) { setError("請先輸入要設定的管理員密碼"); return; }
    const result = await auth.signIn({ email: loginAccount, password: loginPassword });
    if (!current()) return;
    const account = String(result.user.email || "");
    await api.post("/api/admin-credential-bootstrap", { password: loginPassword });
    if (!current()) return;
    await auth.signOut();
    if (!current()) return;
    setLoginAccount(account);
    await api.post("/api/admin-login", { account, password: loginPassword });
    if (!current()) return;
    setLoginPassword("");
    await boot(true);
  });
  const signOut = () => runAuthentication(async current => {
    viewVersion.current += 1;
    loadVersion.current += 1;
    loadPending.current = false;
    bootVersion.current += 1;
    confirmationRef.current?.resolve(false);
    setConfirmation(null);
    await api.post("/api/admin-logout");
    if (!current()) return;
    signedRef.current = false;
    adminIdRef.current = "";
    setSigned(false);
    setAdmin(null);
    setDash(null);
    setPlans([]);
  });
  const refreshPayments = paymentPage.refresh;
  const openProfileName = () => {
    setProfileName(String(admin?.name || ""));
    setShowProfileName(true);
  };
  const saveProfileName = async () => {
    await runConfirmed(
      () => requestConfirmation({ title: "確認修改名稱", message: `管理員名稱將修改為「${profileName.trim() || "未填寫"}」`, confirmLabel: "確認修改" }),
      async () => {
        const current = captureView(true);
        setBusy(true);
        setError("");
        try {
          const updated = await saveOwnAdminName(api, profileName);
          if (!current()) return;
          setAdmin((current) => ({ ...current, ...updated }));
          setShowProfileName(false);
        } catch (e) {
          if (current()) setError(e instanceof Error ? e.message : "管理員名稱更新失敗");
        } finally {
          if (current()) setBusy(false);
        }
      },
    );
  };
  const fields = useMemo(() => labels[tableMap[active]] || [], [active]);
  useEffect(() => {
    setSelectedActivationCodeIds(new Set());
    setActivationCopyFeedback("");
  }, [active, JSON.stringify(listPage.query)]);
  const changeTablePage = (page: number) => {
    listPage.setPage(page);
    setSelectedActivationCodeIds(new Set());
    setActivationCopyFeedback("");
  };
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
        const current = captureView(true);
        setBusy(true);
        try {
          await activationBatchSubmitter.current.submit(adminIdRef.current, durationType, quantity);
          if (!current()) return;
          setShowForm(false);
          setForm({});
          await load(active);
        } catch (e) {
          if (current()) setError(e instanceof Error ? e.message : "批次建立失敗");
        } finally {
          if (current()) setBusy(false);
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
        const current = captureView(true);
        setBusy(true);
        setError("");
        try {
          await deleteActivationCode(api, id);
          if (!current()) return;
          await load("啟動碼管理");
        } catch (e) {
          if (current()) setError(e instanceof Error ? e.message : "刪除啟動碼失敗");
        } finally {
          if (current()) setBusy(false);
        }
      },
    );
  };
  const toggleActivationSelectionMode = () => {
    setActivationSelectionMode((current) => !current);
    setSelectedActivationCodeIds(new Set());
    setActivationCopyFeedback("");
  };
  const toggleActivationCode = (id: string) => {
    setSelectedActivationCodeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActivationCopyFeedback("");
  };
  const showActivationCopyFeedback = (message: string) => {
    setActivationCopyFeedback(message);
    if (activationCopyFeedbackTimer.current !== null) window.clearTimeout(activationCopyFeedbackTimer.current);
    activationCopyFeedbackTimer.current = window.setTimeout(() => {
      setActivationCopyFeedback("");
      activationCopyFeedbackTimer.current = null;
    }, 2000);
  };
  const copySelectedActivationCodes = async () => {
    const codes = rows
      .filter((row) => selectedActivationCodeIds.has(row.id))
      .map((row) => String(row.code ?? ""))
      .filter(Boolean);
    if (codes.length === 0) {
      showActivationCopyFeedback("請先勾選啟動碼");
      return;
    }
    const current = captureView();
    try {
      await writeClipboardText(codes.join("\n"));
      if (!current()) return;
      showActivationCopyFeedback(`已複製 ${codes.length} 組啟動碼`);
    } catch {
      if (current()) showActivationCopyFeedback("複製失敗");
    }
  };
  const saveAdmin = async () => {
    await runConfirmed(
      () => requestConfirmation({
        title: editingAdmin ? "確認修改管理員" : "確認新增管理員",
        message: `${adminForm.account || "未填寫帳號"}／${adminForm.name || "未填寫名稱"}／${adminForm.role}`,
        confirmLabel: editingAdmin ? "確認修改" : "確認新增",
      }),
      async () => {
        const current = captureView(true);
        setBusy(true);
        setError("");
        try {
          if (editingAdmin) await api.put(`/api/admins/${editingAdmin}`, adminForm);
          else await api.post("/api/admins", adminForm);
          if (!current()) return;
          setAdminForm(defaultAdmin());
          setEditingAdmin(null);
          setShowForm(false);
          await load("管理員權限");
        } catch (e) {
          if (current()) setError(e instanceof Error ? e.message : "管理員儲存失敗");
        } finally {
          if (current()) setBusy(false);
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
        const current = captureView(true);
        setBusy(true);
        try {
          await api.delete(`/api/admins/${id}`);
          if (!current()) return;
          await load("管理員權限");
        } catch (e) {
          if (current()) setError(e instanceof Error ? e.message : "刪除管理員失敗");
        } finally {
          if (current()) setBusy(false);
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
        const current = captureView(true);
        setBusy(true);
        setError("");
        try {
          await api.post("/api/revenue/reset");
          if (!current()) return;
          await load("收入報表");
        } catch (e) {
          if (current()) setError(e instanceof Error ? e.message : "收入重設失敗");
        } finally {
          if (current()) setBusy(false);
        }
      },
    );
  };
  const roleChange = (role: string) => setAdminForm((current) => ({
    ...current,
    role,
    permissions: defaultOperationPermissions(role),
  }));
  if (!signed && bootstrapUnavailable)
    return (
      <div className="login"><div className="loginCard">
        <div className="brand">樂彩 Matrix</div>
        <h1>營運後台</h1>
        <p role="alert">後台連線異常，請重新載入</p>
        <button className="loginPrimary" onClick={() => void boot(true)} disabled={busy}>重新載入</button>
      </div></div>
    );
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
            <button className="loginPrimary" onClick={signIn} disabled={busy}>登入營運後台</button>
            <button className="credentialSetupButton loginPrimary" onClick={setupOwnerCredential} disabled={busy}>超級管理員首次設定</button>
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
          {active === "權限切換" && (
            <PermissionSwitches
              key={sessionKey}
              client={api}
              canEdit={Boolean(isSuper)}
              confirm={requestConfirmation}
            />
          )}{" "}
          {active === "系統設定" && <SystemSettings canEdit={can("edit")} confirm={requestConfirmation} />}{" "}
          {active === "通知管理" && <NotificationManagement key={sessionKey} client={api} canEdit={can("edit")} />}{" "}
          {active === "代辦事項" && admin && (
            <AdminTodos
              key={sessionKey}
              client={api}
              admin={{ id: String(admin.id ?? ""), role: String(admin.role ?? "") }}
              requestConfirmation={requestConfirmation}
            />
          )}{" "}
          {active === "用戶管理" && (
            <UserManager
              key={sessionKey}
              revision={memberListRevision}
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
                    const current = captureView(true);
                    setBusy(true);
                    setError("");
                    try {
                      await saveMemberStatus(api, id, status);
                      if (!current()) return;
                      await load("用戶管理");
                    } catch (e) {
                      if (current()) setError(e instanceof Error ? e.message : "會員狀態更新失敗");
                    } finally {
                      if (current()) setBusy(false);
                    }
                  },
                );
              }}
            />
          )}{" "}
          {active === "訂閱管理" && (
            <SubscriptionManager
              key={sessionKey}
              revision={memberListRevision}
              plans={plans}
              transferPage={transferPage}
              paymentPage={paymentPage}
              isSuper={isSuper}
              canEdit={moduleCan("subscriptions", "edit", "edit")}
              confirm={requestConfirmation}
              onPaymentReversal={(id, status, reason) => api.put(`/api/payments/${id}/reversal`, { status, reason })}
              onPaymentRefresh={refreshPayments}
              onSubscription={async (id, payload) => {
                return runConfirmed(
                  () => requestConfirmation({ title: "確認修改訂閱", message: `會員 ${id} 的訂閱資料將更新。`, confirmLabel: "確認修改" }),
                  async () => {
                    const current = captureView(true);
                    setBusy(true);
                    setError("");
                    try {
                      await saveSubscription(api, id, payload);
                      if (!current()) return;
                      await load("訂閱管理");
                    } finally {
                      if (current()) setBusy(false);
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
                    const current = captureView(true);
                    setBusy(true);
                    setError("");
                    try {
                      await api.put(`/api/transfer-requests/${id}`, { decision });
                      if (!current()) return;
                      await load("訂閱管理");
                    } catch (e) {
                      if (current()) setError(e instanceof Error ? e.message : "轉帳審核失敗");
                    } finally {
                      if (current()) setBusy(false);
                    }
                  },
                );
              }}
            />
          )}{" "}
          {active === "管理員權限" && (<>
            <AdminListControls page={listPage} name="管理員" statuses={[["啟用", "啟用"], ["停用", "停用"]]} sorts={[["createdAt", "建立時間"], ["account", "帳號"], ["name", "名稱"]]} />
            <AdminManager
              busy={busy || listPage.loading}
              emptyMessage={listPage.loading ? "資料讀取中" : listPage.error ? "資料載入失敗" : "目前沒有資料"}
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
            <Pagination page={listPage.currentPage} totalPages={listPage.totalPages} onPage={changeTablePage} disabled={listPage.loading || Boolean(listPage.error)} />
          </>)}{" "}
          {tableMap[active] && !["用戶管理", "訂閱管理"].includes(active) && (
            <>
              <div className="toolbar">
                <div>{listPage.total} 筆資料</div>
                {active === "啟動碼管理" && (
                  <div className="activationCodeToolbarActions">
                    {activationCopyFeedback && <span className="activationCopyStatus" role="status">{activationCopyFeedback}</span>}
                    <button
                      className="compactButton activationCodeSelectButton"
                      aria-pressed={activationSelectionMode}
                      onClick={toggleActivationSelectionMode}
                    >
                      選取
                    </button>
                    {activationSelectionMode && (
                      <button className="compactButton activationCodeCopyButton" onClick={() => void copySelectedActivationCodes()}>
                        複製
                      </button>
                    )}
                    {moduleCan("activationCodes", "edit", "add") && (
                      <button
                        className="primary activationCodeAddButton"
                        onClick={() => showForm ? setShowForm(false) : openActivationCodeForm()}
                      >
                        <Plus size={15} />
                        新增
                      </button>
                    )}
                  </div>
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
              <AdminListControls page={listPage} name={active} statuses={active === "啟動碼管理" ? [["unused", "未使用"], ["used", "已使用"], ["expired", "已到期"]] : []}
                sorts={active === "啟動碼管理" ? [["createdAt", "建立時間"], ["expiresAt", "到期時間"], ["code", "啟動碼"]] : active === "審計日誌" ? [["operationTime", "操作時間"], ["admin", "管理員"]] : [["loginAt", "登入時間"], ["account", "管理員帳號"]]} />
              {listPage.loading && <div role="status" className="loading">資料讀取中…</div>}
              <DataTable
                emptyMessage={listPage.loading ? "資料讀取中" : listPage.error ? "資料載入失敗" : "目前沒有資料"}
                rows={rows}
                fields={fields}
                canDelete={active === "啟動碼管理" && moduleCan("activationCodes", "edit", "delete")}
                onDelete={deleteCode}
                selection={active === "啟動碼管理" ? {
                  enabled: activationSelectionMode,
                  selectedIds: selectedActivationCodeIds,
                  onToggle: toggleActivationCode,
                } : undefined}
                getDeleteDisabledReason={active === "啟動碼管理" && !isSuper
                  ? (row) => redeemedActivationCode(row) ? "已兌換，僅超級管理員可刪除" : ""
                  : undefined}
              />
              <Pagination page={listPage.currentPage} totalPages={listPage.totalPages} onPage={changeTablePage} disabled={listPage.loading || Boolean(listPage.error)} />
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
  revision,
  canEdit,
  onStatus,
}: {
  revision: number;
  canEdit: boolean;
  onStatus: (id: string, status: "active" | "disabled") => Promise<void>;
}) {
  const memberPage = useAdminMemberPage("users", revision, api);
  const { setPage, paged, loading, error } = memberPage;
  const [userInfo, setUserInfo] = useState<Row | null>(null);
  const fields = ["lineDisplayName", "registeredAt", "lastOnlineAt", "recentOnlineMinutes", "status", "recentIp", "estimatedRegion"];
  const statusText = (value: unknown) => String(value) === "disabled" || String(value) === "停用" ? "停用" : "啟用";
  const showValue = (field: string, row: Row) => field === "status"
    ? statusText(row[field])
    : field === "recentOnlineMinutes" ? `${Number(row[field] || 0)} 分鐘` : displayValue(field, row[field]);
  return (
    <>
      <AdminListControls page={memberPage} name="會員" statuses={[["active", "啟用"], ["disabled", "停用"]]} sorts={[["registeredAt", "註冊時間"], ["lastOnlineAt", "最後上線時間"], ["lineDisplayName", "LINE 名稱"]]} />
      <div className="managementList tableWrap" aria-busy={loading}>
        <table>
          <thead><tr>{fields.map((field) => <th key={field}>{zh[field] || field}</th>)}<th>用戶資訊</th></tr></thead>
          <tbody>{paged.items.length === 0 ? <tr><td colSpan={fields.length + 1} className="empty">{loading ? "資料讀取中" : error ? "資料載入失敗" : "目前沒有資料"}</td></tr> : paged.items.map((row) => (
            <tr key={row.id}>
              {fields.map((field) => <td key={field}>{field === "status" ? <span className="memberStatusCell">{showValue(field, row)}{canEdit && <button className="compactButton" onClick={() => onStatus(row.id, statusText(row.status) === "停用" ? "active" : "disabled")}>{statusText(row.status) === "停用" ? "啟動" : "停權"}</button>}</span> : showValue(field, row)}</td>)}
              <td><button className="compactButton" onClick={() => setUserInfo(row)}>用戶資訊</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Pagination page={paged.currentPage} totalPages={paged.totalPages} onPage={setPage} disabled={loading || Boolean(error)} />
      {userInfo && <UserInfoDialog key={userInfo.id} row={userInfo} client={api} onClose={() => setUserInfo(null)} />}
    </>
  );
}

type SubscriptionPayload = {
  action: "activate" | "renew" | "cancel" | "adjustExpiry" | "lifetime";
  planId?: string;
  expiresAt?: string;
};

function SubscriptionManager({
  revision,
  plans,
  transferPage,
  paymentPage,
  isSuper,
  canEdit,
  confirm,
  onPaymentReversal,
  onPaymentRefresh,
  onSubscription,
  onTransfer,
}: {
  revision: number;
  plans: Row[];
  transferPage: AdminDataPageController;
  paymentPage: AdminDataPageController;
  isSuper: boolean;
  canEdit: boolean;
  confirm: (request: Omit<ConfirmationRequest, "resolve">) => Promise<boolean>;
  onPaymentReversal: (id: string, status: PaymentReversalStatus, reason: string) => Promise<unknown>;
  onPaymentRefresh: () => Promise<unknown>;
  onSubscription: (id: string, payload: SubscriptionPayload) => Promise<boolean>;
  onTransfer: (id: string, decision: "confirmed" | "rejected") => Promise<void>;
}) {
  const memberPage = useAdminMemberPage("subscriptions", revision, api);
  const { plan, setPlan, setPage, paged, loading, error } = memberPage;
  const [editing, setEditing] = useState<Row | null>(null);
  const [action, setAction] = useState<SubscriptionPayload["action"]>("activate");
  const [planId, setPlanId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const expiryInputRef = useRef<HTMLInputElement>(null);
  const subscriptionSubmitLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [userInfo, setUserInfo] = useState<Row | null>(null);
  const open = (row: Row, nextAction: SubscriptionPayload["action"]) => {
    if (subscriptionSubmitLock.current) return;
    setEditing(row);
    setAction(nextAction);
    setSaveError("");
    setPlanId(String(row.currentPlanId || plans[0]?.id || ""));
    setExpiresAt(row.planExpiresAt ? adminBusinessDateKey(String(row.planExpiresAt)) : "");
  };
  const submit = async () => {
    if (!editing || subscriptionSubmitLock.current) return;
    if (action === "adjustExpiry" && !expiresAt) {
      setSaveError("請選擇到期日後再確認");
      expiryInputRef.current?.focus();
      return;
    }
    const payload: SubscriptionPayload = { action };
    if (action === "activate" || action === "renew") payload.planId = planId;
    if (action === "adjustExpiry") payload.expiresAt = expiresAt;
    subscriptionSubmitLock.current = true;
    setSubmitting(true);
    setSaveError("");
    try {
      const saved = await onSubscription(editing.id, payload);
      if (mounted.current && saved) setEditing(null);
    } catch {
      if (mounted.current) setSaveError("訂閱更新失敗，請確認日期與連線後重試");
    } finally {
      subscriptionSubmitLock.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };
  const actionText: Record<SubscriptionPayload["action"], string> = {
    activate: "開通", renew: "續訂", cancel: "取消續訂", adjustExpiry: "調整到期日", lifetime: "設為終生",
  };
  return (
    <>
      <AdminListControls page={memberPage} name="訂閱" className="subscriptionManagementToolbar" statuses={[["active", "啟用"], ["disabled", "停用"]]} sorts={[["planStartedAt", "開始時間"], ["planExpiresAt", "到期時間"], ["lineDisplayName", "LINE 名稱"]]}>
        <select aria-label="篩選訂閱方案" value={plan} onChange={(event) => setPlan(event.target.value)}>
          <option value="all">全部方案</option><option value="monthly">月費</option><option value="quarterly">季費</option><option value="yearly">年費</option>
        </select>
      </AdminListControls>
      <div className="managementList tableWrap" aria-busy={loading}>
        <table>
          <thead><tr><th>LINE名稱</th><th>訂閱方案</th><th>開始時間</th><th>到期時間</th><th>自動續訂</th><th>調整到期日</th><th>用戶資訊</th></tr></thead>
          <tbody>{paged.items.length === 0 ? <tr><td colSpan={7} className="empty">{loading ? "資料讀取中" : error ? "資料載入失敗" : "目前沒有資料"}</td></tr> : paged.items.map((row) => (
            <tr key={row.id}>
              <td>{text(row.lineDisplayName)}</td><td>{text(row.planName)}</td><td>{formatAdminDateTime(row.planStartedAt)}</td><td>{row.isLifetime ? "終生" : formatAdminDateTime(row.planExpiresAt)}</td><td>{row.autoRenew ? "是" : "否"}</td>
              <td>{canEdit && <button className="compactButton subscriptionTableAction" onClick={() => open(row, "adjustExpiry")}>調整到期日</button>}</td>
              <td><button className="compactButton subscriptionTableAction" onClick={() => setUserInfo(row)}>用戶資訊</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Pagination page={paged.currentPage} totalPages={paged.totalPages} onPage={setPage} disabled={loading || Boolean(error)} />
      {editing && (
        <div className="modalBackdrop" role="presentation">
          <div className="operationDialog" role="dialog" aria-modal="true" aria-labelledby="subscription-action-title" aria-busy={submitting}>
            <h2 id="subscription-action-title">{actionText[action]}</h2>
            <p>{text(editing.authUserId)}</p>
            {(action === "activate" || action === "renew") && <label>方案<select disabled={submitting} value={planId} onChange={(event) => setPlanId(event.target.value)}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{text(plan.name)}／{money(Number(plan.price))}／{text(plan.durationDays)} 天</option>)}</select></label>}
            {action === "adjustExpiry" && <label>到期日<input ref={expiryInputRef} type="date" disabled={submitting} value={expiresAt} aria-invalid={Boolean(saveError) && !expiresAt} aria-describedby={saveError ? "subscription-save-error" : undefined} onChange={(event) => { setExpiresAt(event.target.value); setSaveError(""); }} /></label>}
            {action === "cancel" && <p>取消後只停止自動續訂，權限保留至到期日。</p>}
            {saveError && <p className="error" id="subscription-save-error" role="alert">{saveError}</p>}
            <div className="formActions"><button disabled={submitting} onClick={() => setEditing(null)}>取消</button><button className="primary" disabled={submitting} onClick={submit}>確認</button></div>
          </div>
        </div>
      )}
      {userInfo && <UserInfoDialog key={userInfo.id} row={userInfo} client={api} module="subscriptions" onClose={() => setUserInfo(null)} />}
      <AdminListControls page={paymentPage} showError={false} name="付款紀錄" statuses={[["confirmed", "已付款"], ["refunded", "已退款"], ["chargeback", "已刷退"], ["cancelled", "已取消"]]} sorts={[["paidAt", "付款時間"], ["amount", "付款金額"]]} />
      <PaymentReversalPanel
        key={JSON.stringify(paymentPage.query)}
        payments={paymentPage.loading || paymentPage.error ? null : paymentPage.items.map(paymentRecord)}
        loadError={paymentPage.error ? "付款紀錄載入失敗，請重新載入" : ""}
        canEdit={canEdit}
        confirm={confirm}
        onRecord={onPaymentReversal}
        onRefresh={onPaymentRefresh}
      />
      <Pagination page={paymentPage.currentPage} totalPages={paymentPage.totalPages} onPage={paymentPage.setPage} disabled={paymentPage.loading || Boolean(paymentPage.error)} />
      <div className="panel transferPanel" id="transfer-requests">
        <h2>轉帳申請</h2>
        <AdminTransferPush client={api} isSuper={isSuper} />
        <AdminListControls page={transferPage} name="轉帳申請" statuses={[["pending", "待確認"], ["confirmed", "已確認"], ["rejected", "已拒絕"]]} sorts={[["submittedAt", "申請時間"], ["amount", "轉帳金額"]]} />
        {transferPage.loading ? <div role="status" className="loading">資料讀取中…</div> : transferPage.error ? null : transferPage.items.length === 0 ? <div className="empty">目前沒有資料</div> : transferPage.items.map((row) => (
          <div className="transferRow" key={row.id}>
            <div><b>{text(row.lineDisplayName)}</b><span>{text(row.planName)}／{money(Number(row.amount))}／末五碼 {text(row.accountLastFive)}</span></div>
            <span>{({ pending: "待確認", confirmed: "已確認", rejected: "已拒絕" } as Record<string, string>)[String(row.status)] || text(row.status)}</span>
            {canEdit && row.status === "pending" && <div className="transferActions"><button onClick={() => onTransfer(row.id, "confirmed")}>確認</button><button className="transferReject" onClick={() => onTransfer(row.id, "rejected")}>拒絕</button></div>}
          </div>
        ))}
        <Pagination page={transferPage.currentPage} totalPages={transferPage.totalPages} onPage={transferPage.setPage} disabled={transferPage.loading || Boolean(transferPage.error)} />
      </div>
    </>
  );
}

function Pagination({ page, totalPages, onPage, disabled = false }: { page: number; totalPages: number; onPage: (page: number) => void; disabled?: boolean }) {
  return (
    <div className="pagination" aria-label="分頁">
      <button disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>上一頁</button>
      <span>第 {page}／{totalPages} 頁</span>
      <button disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>下一頁</button>
    </div>
  );
}

function AdminManager({
  rows,
  busy,
  emptyMessage,
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
  busy: boolean;
  emptyMessage: string;
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
    超級管理員: "用戶管理、訂閱管理、啟動碼管理、權限切換、系統設定、管理員權限",
    營運管理員: "用戶管理、訂閱管理、啟動碼管理；權限切換與系統設定僅查看",
    查看人員: "用戶管理、訂閱管理、啟動碼管理、權限切換、系統設定僅查看",
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
            <button className="primary" onClick={onSave} disabled={busy}>
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
                  {emptyMessage}
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
                          <button onClick={() => onEdit(r)} disabled={busy}>
                            <Pencil size={15} />
                          </button>
                          <button
                            className="danger"
                            onClick={() => onDelete(r.id)}
                            disabled={busy}
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
function Cards({ items, splitAfter }: { items: [string, string][]; splitAfter?: number }) {
  return (
    <div className={splitAfter ? "cards overviewCards" : "cards"}>
      {items.flatMap(([a, b], index) => [
        ...(index === splitAfter ? [<div className="metricDivider" role="separator" aria-label="瀏覽與訂閱統計分隔" key="divider" />] : []),
        <div className="metric" key={a}>
          <span>{a}</span>
          <strong>{b}</strong>
        </div>,
      ])}
    </div>
  );
}
function Overview({ d }: { d: Dashboard }) {
  return (
    <>
      <Cards
        splitAfter={4}
        items={[
          ["本日瀏覽人數", d.todayVisitors == null ? "—" : String(d.todayVisitors)],
          ["本月瀏覽人數", d.monthVisitors == null ? "—" : String(d.monthVisitors)],
          ["總瀏覽人數", d.totalVisitors == null ? "—" : String(d.totalVisitors)],
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
function SystemSettings({ canEdit, confirm }: { canEdit: boolean; confirm: (request: Omit<ConfirmationRequest, 'resolve'>) => Promise<boolean> }) {
  const [items, setItems] = useState<SystemStatusItem[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [checking, setChecking] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [refreshingId, setRefreshingId] = useState("");
  const [operating, setOperating] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ id: string; outcome: Exclude<SystemStatusActionOutcome, "failure"> } | null>(null);
  const requestInFlight = useRef(false);
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const captureRequest = () => {
    const sequence = ++requestSequence.current;
    return () => mounted.current && sequence === requestSequence.current;
  };
  const statusSectionRef = useRef<HTMLElement | null>(null);
  const refresh = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const current = captureRequest();
    setChecking(true);
    setStatusError("");
    setStatusNotice("");
    try {
      const result = await loadSystemStatus(api);
      if (!current()) return;
      setItems(result.items);
      setCheckedAt(result.checkedAt);
    } catch (cause) {
      if (!current()) return;
      setStatusError(cause instanceof Error ? cause.message : "連線狀態檢查失敗");
    } finally {
      requestInFlight.current = false;
      if (current()) setChecking(false);
    }
  };
  const retry = async (id: string) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const current = captureRequest();
    setRetryingId(id);
    setStatusError("");
    setStatusNotice("");
    try {
      const next = await retrySystemStatus(api, id);
      if (!current()) return;
      setItems((current) => current.map((item) => item.id === id ? next : item));
      setCheckedAt(next.checkedAt);
      setStatusNotice(`${next.name} 重新呼叫完成，API 連線${next.ok ? "正常" : "仍為異常"}`);
      setFocusRequest({ id, outcome: "success" });
    } catch (cause) {
      if (!current()) return;
      setStatusError(cause instanceof Error ? cause.message : "API 重新呼叫失敗");
    } finally {
      requestInFlight.current = false;
      if (current()) setRetryingId("");
    }
  };
  const refreshCrawler = async (item: SystemStatusItem) => {
    if (requestInFlight.current || !canRefreshCrawler(item, canEdit)) return;
    requestInFlight.current = true;
    const current = captureRequest();
    setRefreshingId(item.id);
    setStatusError("");
    setStatusNotice("");
    try {
      const result = await refreshCrawlerSystemStatus(api, item.id);
      if (!current()) return;
      setStatusNotice(`${result.lottery} 已手動更新至 ${result.period} 期`);
      try {
        const next = await loadSystemStatus(api);
      if (!current()) return;
        setItems(next.items);
        setCheckedAt(next.checkedAt);
        setFocusRequest({ id: item.id, outcome: "success" });
      } catch {
        if (!current()) return;
        setStatusError("開獎資料已更新，但狀態重新檢查失敗");
        setFocusRequest({ id: item.id, outcome: "partial-success" });
      }
    } catch (cause) {
      if (!current()) return;
      setStatusError(cause instanceof Error ? cause.message : "開獎資料手動更新失敗");
    } finally {
      requestInFlight.current = false;
      if (current()) setRefreshingId("");
    }
  };
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; requestSequence.current += 1; requestInFlight.current = false; };
  }, []);
  useEffect(() => {
    if (!focusRequest) return;
    focusSystemStatusAfterAction(statusSectionRef.current, focusRequest.id, focusRequest.outcome);
    setFocusRequest(null);
  }, [focusRequest, items]);
  const actionPending = operating || checking || Boolean(retryingId) || Boolean(refreshingId);
  return (
    <section ref={statusSectionRef} className="systemStatusSection" aria-labelledby="system-status-title" tabIndex={-1}>
      <header className="systemStatusHeader">
        <div><h2 id="system-status-title">服務檢查</h2><span>最後檢查時間：{checkedAt ? formatAdminDateTime(checkedAt) : "尚未檢查"}</span></div>
        <button className="compactButton" onClick={refresh} disabled={actionPending} aria-busy={checking}><RefreshCw size={15} />{checking ? "檢查中…" : "重新檢查"}</button>
      </header>
      {statusError && <div className="error" role="alert">{statusError}</div>}
      {statusNotice && <div className="systemStatusNotice" role="status">{statusNotice}</div>}
      <RailwayOperations client={api} canEdit={canEdit} confirm={confirm} disabled={checking || Boolean(retryingId) || Boolean(refreshingId)} onBusyChange={value => { requestInFlight.current = value; setOperating(value); }} />
      {items.length === 0 && <div className="statusEmpty">{checking ? "正在檢查服務狀態…" : "目前沒有服務狀態"}</div>}
      <div className="statusGroups">
        {groupSystemStatusItems(items).map((group) => {
          const abnormalCount = group.items.filter((item) => getSystemStatusPresentation(item).tone === "bad").length;
          const limitedCount = group.items.filter((item) => getSystemStatusPresentation(item).tone === "limited").length;
          const warningCount = group.items.filter((item) => getSystemStatusPresentation(item).tone === "warning").length;
          const groupTitleId = `status-group-${group.location.toLowerCase()}`;
          return (
            <section className="statusGroup" key={group.location} aria-labelledby={groupTitleId}>
              <header className="statusGroupHeader">
                <h3 id={groupTitleId}>{group.location}</h3>
                <span>{group.items.length} 項 · {limitedCount} 項僅部分檢查 · {abnormalCount} 項異常{warningCount > 0 ? ` · ${warningCount} 項警告` : ""}</span>
              </header>
              <div className="statusRows">
                {group.items.map((item) => {
                  const detail = item.detail && typeof item.detail === "object" && !Array.isArray(item.detail)
                    ? item.detail as Record<string, unknown>
                    : null;
                  const finishedAt = detail?.finishedAt ?? detail?.finished_at;
                  const presentation = getSystemStatusPresentation(item);
                  const storageSummary = getMatrixStorageFacts(item, "summary");
                  return (
                    <article className="statusRow" key={item.id} data-status-id={item.id} tabIndex={-1} aria-label={`${item.name}：${presentation.label}`}>
                      <div className="statusRowMain">
                        <div className="statusRowTitle">
                          <div className="statusIdentity"><b>{item.name}</b><span>{item.group}</span></div>
                          <div className="statusState"><b className={`statusBadge ${presentation.tone}`}>{presentation.label}</b></div>
                        </div>
                        <p className="statusDescription">{item.description}</p>
                        <p className="statusScope">{presentation.scope}</p>
                        {item.error && <div className="statusErrorText" role="alert">{item.error}</div>}
                        {storageSummary.length > 0 && <dl className="statusFacts">
                          {storageSummary.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{text(fact.value)}</dd></div>)}
                        </dl>}
                        <details className="statusDetails">
                          <summary>檢查明細</summary>
                        <dl className="statusFacts">
                          <div><dt>API 位址</dt><dd className="statusEndpoint">{item.endpoint}</dd></div>
                          <div><dt>檢查時間</dt><dd>{formatAdminDateTime(item.checkedAt)}</dd></div>
                          <div><dt>回應時間</dt><dd>{item.responseMs} ms</dd></div>
                          {[...getGithubStatusFacts(item), ...getMatrixStorageFacts(item), ...getServiceEvidenceFacts(item)].map((fact) => (
                            <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.format === "date" ? formatAdminDateTime(fact.value) : text(fact.value)}</dd></div>
                          ))}
                          {item.id !== "matrix-storage" && detail?.status !== undefined && <div><dt>{typeof detail.status === "number" ? "回應代碼" : "執行結果"}</dt><dd>{formatSystemStatusValue(detail.status)}</dd></div>}
                          {finishedAt !== undefined && <div><dt>排程完成時間</dt><dd>{formatAdminDateTime(finishedAt)}</dd></div>}
                          {item.id === "supabase-watchdog-heartbeat" && (
                            <>
                              <div><dt>監控完成時間</dt><dd>{formatAdminDateTime(detail?.completedAt)}</dd></div>
                              <div><dt>執行頻率</dt><dd>每 10 分鐘</dd></div>
                              <div><dt>檢查設定</dt><dd>依序為 6 分鐘／50 次、10 分鐘／60 次、30 分鐘／18 次；實際每 10 分鐘執行一次。</dd></div>
                            </>
                          )}
                        </dl>
                        </details>
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
  emptyMessage = "目前沒有資料",
  fields,
  canDelete,
  onDelete,
  selection,
  getDeleteDisabledReason,
}: {
  rows: Row[];
  emptyMessage?: string;
  fields: string[];
  canDelete: boolean;
  onDelete: (id: string) => void;
  selection?: {
    enabled: boolean;
    selectedIds: ReadonlySet<string>;
    onToggle: (id: string) => void;
  };
  getDeleteDisabledReason?: (row: Row) => string;
}) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {selection?.enabled && <th scope="col">選取</th>}
            {fields.map((f) => (
              <th scope="col" key={f}>{zh[f] || f}</th>
            ))}
            {canDelete && <th scope="col">操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={fields.length + (canDelete ? 1 : 0) + (selection?.enabled ? 1 : 0)} className="empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const deleteDisabledReason = getDeleteDisabledReason?.(r) ?? "";
              const deleteReasonId = `activation-delete-reason-${r.id}`;
              return (
                <tr key={r.id}>
                  {selection?.enabled && (
                    <td className="activationSelectionCell">
                      <input
                        type="checkbox"
                        checked={selection.selectedIds.has(r.id)}
                        onChange={() => selection.onToggle(r.id)}
                        aria-label={`選取啟動碼 ${text(r.code)}`}
                      />
                    </td>
                  )}
                  {fields.map((f) => (
                    <td key={f}>{displayValue(f, r[f])}</td>
                  ))}
                  {canDelete && (
                    <td className="activationDeleteCell">
                      <button
                        className="danger"
                        aria-label={`刪除啟動碼 ${text(r.code)}`}
                        aria-describedby={deleteDisabledReason ? deleteReasonId : undefined}
                        disabled={Boolean(deleteDisabledReason)}
                        onClick={() => { if (!deleteDisabledReason) onDelete(r.id); }}
                      >
                        <Trash2 size={15} />
                      </button>
                      {deleteDisabledReason && <span id={deleteReasonId} className="activationDeleteRestriction">{deleteDisabledReason}</span>}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
export default AdminApp;
