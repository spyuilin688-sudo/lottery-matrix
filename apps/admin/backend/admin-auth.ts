type Requester = {
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};

export type PermissionKey = 'view' | 'add' | 'edit' | 'delete';
export type Permissions = Record<PermissionKey, boolean>;
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
  return {
    view: Boolean(admin.permissions?.view),
    add: Boolean(admin.permissions?.add),
    edit: Boolean(admin.permissions?.edit),
    delete: Boolean(admin.permissions?.delete),
  };
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
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
  };
  return { ...admin, permissions: getPermissions(admin) };
}
