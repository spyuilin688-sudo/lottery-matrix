import { getModulePermissions, getPermissions, type AdminAccount } from './admin-auth';

type Row = Record<string, unknown>;
type Transport = {
  selectRows<T = unknown>(table: string, query: string): Promise<T[]>;
  insertRows<T = unknown>(table: string, rows: unknown[]): Promise<T[]>;
  updateRows<T = unknown>(table: string, query: string, record: unknown): Promise<T[]>;
  deleteRows<T = unknown>(table: string, query: string): Promise<T[]>;
};

export type CredentialAdmin = AdminAccount & {
  id: string;
  account: string;
  name: string;
  role: string;
  status: string;
  modulePermissions: ReturnType<typeof getModulePermissions>;
  lastLoginAt: string | null;
  createdAt?: string;
};

export class AdminCredentialError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AdminCredentialError';
    this.statusCode = statusCode;
  }
}

const encoder = new TextEncoder();
const cookieName = 'matrix_admin_session';
const sessionSeconds = 86_400;
const passwordIterations = 210_000;
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const randomBase64Url = (size: number) => bytesToBase64(crypto.getRandomValues(new Uint8Array(size))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const digestHex = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const derivePasswordHash = async (password: string, salt: Uint8Array) => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: passwordIterations }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
};
const equalBase64 = (left: string, right: string) => {
  try {
    const a = base64ToBytes(left);
    const b = base64ToBytes(right);
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
  } catch { return false; }
};
const headerValue = (headers: Record<string, string | undefined> | undefined, name: string) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? '';
const cookieToken = (headers?: Record<string, string | undefined>) => headerValue(headers, 'cookie').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
const normalizeAccount = (account: string) => account.trim().toLowerCase();
const mapAdmin = (row: Row): CredentialAdmin => {
  const base: AdminAccount = { id: String(row.id), account: String(row.account ?? ''), name: String(row.name ?? row.account ?? ''), role: String(row.role ?? ''), status: String(row.status ?? '') };
  return { ...base, id: String(row.id), account: String(row.account ?? ''), name: String(row.name ?? row.account ?? ''), role: String(row.role ?? ''), status: String(row.status ?? ''), permissions: getPermissions(base), modulePermissions: getModulePermissions(base), lastLoginAt: typeof row.last_login_at === 'string' ? row.last_login_at : null, createdAt: typeof row.created_at === 'string' ? row.created_at : undefined };
};

export function createAdminCredentialAuth(transport: Transport, now = () => new Date()) {
  const passwordFields = async (password: string, required: boolean) => {
    if (!password) {
      if (required) throw new AdminCredentialError('管理員密碼必填', 400);
      return {};
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { password_salt: bytesToBase64(salt), password_hash: await derivePasswordHash(password, salt) };
  };
  const setPassword = async (adminId: string, password: string) => {
    const rows = await transport.updateRows<Row>('admin_accounts', `id=eq.${encodeURIComponent(adminId)}`, await passwordFields(password, true));
    if (!rows[0]) throw new AdminCredentialError('管理員帳號不存在', 404);
  };
  const isConfigured = async (adminId: string) => {
    const rows = await transport.selectRows<Row>('admin_accounts', `select=id,password_hash&id=eq.${encodeURIComponent(adminId)}&limit=1`);
    return typeof rows[0]?.password_hash === 'string' && Boolean(rows[0].password_hash);
  };
  const login = async (account: string, password: string) => {
    const normalized = normalizeAccount(account);
    if (!normalized || !password) throw new AdminCredentialError('管理員帳號或密碼錯誤');
    const rows = await transport.selectRows<Row>('admin_accounts', `select=id,account,name,role,status,can_view,can_add,can_edit,can_delete,last_login_at,created_at,password_salt,password_hash&account=ilike.${encodeURIComponent(normalized)}&limit=2`);
    const row = rows.find((item) => normalizeAccount(String(item.account ?? '')) === normalized);
    const salt = typeof row?.password_salt === 'string' ? row.password_salt : '';
    const storedHash = typeof row?.password_hash === 'string' ? row.password_hash : '';
    if (!row || !salt || !storedHash) throw new AdminCredentialError('管理員帳號或密碼錯誤');
    if (!equalBase64(await derivePasswordHash(password, base64ToBytes(salt)), storedHash)) throw new AdminCredentialError('管理員帳號或密碼錯誤');
    if (row.status !== '啟用') throw new AdminCredentialError('管理員帳號已停用', 403);
    const token = randomBase64Url(32);
    await transport.insertRows('admin_sessions', [{ token_hash: await digestHex(token), admin_id: row.id, expires_at: new Date(now().getTime() + sessionSeconds * 1000).toISOString() }]);
    return { admin: mapAdmin(row), token };
  };
  const getAdminFromHeaders = async (headers?: Record<string, string | undefined>) => {
    const token = cookieToken(headers);
    if (!token) throw new AdminCredentialError('管理員登入已失效');
    const tokenHash = await digestHex(token);
    const sessions = await transport.selectRows<Row>('admin_sessions', `select=admin_id,expires_at&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`);
    const session = sessions[0];
    const expiresAt = typeof session?.expires_at === 'string' ? new Date(session.expires_at) : null;
    if (!session || !expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now().getTime()) {
      if (session) await transport.deleteRows('admin_sessions', `token_hash=eq.${encodeURIComponent(tokenHash)}`);
      throw new AdminCredentialError('管理員登入已失效');
    }
    const admins = await transport.selectRows<Row>('admin_accounts', `select=id,account,name,role,status,can_view,can_add,can_edit,can_delete,last_login_at,created_at&id=eq.${encodeURIComponent(String(session.admin_id))}&limit=1`);
    if (!admins[0]) throw new AdminCredentialError('管理員登入已失效');
    if (admins[0].status !== '啟用') throw new AdminCredentialError('管理員帳號已停用', 403);
    return mapAdmin(admins[0]);
  };
  const logout = async (headers?: Record<string, string | undefined>) => {
    const token = cookieToken(headers);
    if (token) await transport.deleteRows('admin_sessions', `token_hash=eq.${encodeURIComponent(await digestHex(token))}`);
  };
  return { passwordFields, setPassword, isConfigured, login, getAdminFromHeaders, logout, sessionCookie: (token: string) => `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${sessionSeconds}`, clearSessionCookie: () => `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` };
}
