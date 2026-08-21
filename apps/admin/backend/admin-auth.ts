type Requester = {
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};

export type PermissionKey = 'view' | 'add' | 'edit' | 'delete';
export type Permissions = Record<PermissionKey, boolean>;
export type ModuleKey = 'users' | 'subscriptions' | 'activationCodes' | 'systemSettings' | 'admins';
export type ModuleAction = 'view' | 'edit';
export type ModulePermissions = Record<ModuleKey, Record<ModuleAction, boolean>>;
export type AdminAccount = {
  id?: string;
  account?: string;
  name?: string;
  role?: string;
  status?: string;
  permissions?: Partial<Permissions>;
};

type AdminRow = {
  id: string;
  account: string;
  name: string;
  role: string;
  status: string;
  can_view?: boolean;
  can_add?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  last_login_at?: string | null;
  created_at?: string;
};

export class AdminAccessError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'AdminAccessError';
    this.statusCode = statusCode;
  }
}

export function getPermissions(admin: AdminAccount): Permissions {
  if (admin.role === '超級管理員') {
    return { view: true, add: true, edit: true, delete: true };
  }
  if (admin.role === '營運管理員') {
    return { view: true, add: true, edit: true, delete: false };
  }
  return { view: true, add: false, edit: false, delete: false };
}

export function shouldRecordAdminActivity(admin: AdminAccount) {
  return admin.role !== '超級管理員';
}

const roleModules: Record<string, ModulePermissions> = {
  超級管理員: {
    users: { view: true, edit: true },
    subscriptions: { view: true, edit: true },
    activationCodes: { view: true, edit: true },
    systemSettings: { view: true, edit: true },
    admins: { view: true, edit: true },
  },
  營運管理員: {
    users: { view: true, edit: true },
    subscriptions: { view: true, edit: true },
    activationCodes: { view: true, edit: true },
    systemSettings: { view: true, edit: false },
    admins: { view: false, edit: false },
  },
  查看人員: {
    users: { view: true, edit: false },
    subscriptions: { view: true, edit: false },
    activationCodes: { view: true, edit: false },
    systemSettings: { view: true, edit: false },
    admins: { view: false, edit: false },
  },
};

export function getModulePermissions(admin: AdminAccount): ModulePermissions {
  return roleModules[String(admin.role)] ?? roleModules.查看人員;
}

export function requireModulePermission(
  admin: AdminAccount,
  module: ModuleKey,
  action: ModuleAction,
): void {
  if (!getModulePermissions(admin)[module][action]) throw new AdminAccessError('權限不足');
}

export function requirePermission(admin: AdminAccount, key: PermissionKey): void {
  if (!getPermissions(admin)[key]) throw new AdminAccessError('權限不足');
}

export async function requireAdmin(email: string | null | undefined, api: Requester) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized) throw new AdminAccessError('此帳號沒有管理員權限');
  const rows = await api.request<AdminRow[]>(
    `/rest/v1/admin_accounts?select=*&account=ilike.${encodeURIComponent(normalized)}&limit=2`,
  );
  const row = rows.find((item) => item.account.trim().toLowerCase() === normalized);
  if (!row) throw new AdminAccessError('此帳號沒有管理員權限');
  if (row.status !== '啟用') throw new AdminAccessError('管理員帳號已停用');

  const admin = {
    id: row.id,
    account: row.account,
    name: row.name,
    role: row.role,
    status: row.status,
    permissions: {
      view: Boolean(row.can_view),
      add: Boolean(row.can_add),
      edit: Boolean(row.can_edit),
      delete: Boolean(row.can_delete),
    },
    modulePermissions: getModulePermissions({ role: row.role }),
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
  };
  return { ...admin, permissions: getPermissions(admin) };
}
