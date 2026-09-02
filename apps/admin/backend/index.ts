import { error, json, requireAuth, router, secrets } from '@appdeploy/sdk';
import {
  AdminAccessError,
  requireAdmin,
  requireModulePermission,
  requirePermission,
  shouldRecordAdminActivity,
  type ModuleAction,
  type ModuleKey,
  type PermissionKey,
} from './admin-auth';
import { createAdminData, getDashboard, listAdminTable } from './admin-data';
import { createAdminCredentialAuth, type CredentialAdmin } from './admin-credential-auth';
import { createConnectionStatus } from './connection-status';
import { createPushNotifications, requireMemberUuid } from './push-notifications';
import { createSupabaseTransport, getSupabaseConfig } from './supabase';
import { createWorkerApi, getWorkerConfig } from './worker-api';

type Context = {
  body?: unknown;
  event?: {
    headers?: Record<string, string | undefined>;
    requestContext?: { http?: { sourceIp?: string } };
  };
  params: Record<string, string>;
  user?: { email?: string | null };
  admin?: CredentialAdmin;
};

type PermissionInput = { view?: boolean; add?: boolean; edit?: boolean; delete?: boolean };

const supabase = createSupabaseTransport(() => getSupabaseConfig(secrets));
const pushNotifications = createPushNotifications(() => getSupabaseConfig(secrets));
const adminData = createAdminData(supabase);
const credentialAuth = createAdminCredentialAuth(supabase);
const workerApi = createWorkerApi(() => getWorkerConfig(secrets));
const connectionStatus = createConnectionStatus({ supabase, loadConfig: () => getSupabaseConfig(secrets), getWorkerStatus: () => workerApi.getStatus() });
const now = () => new Date().toISOString();
const fail = (cause: unknown) => {
  const value = cause as { message?: string; statusCode?: number };
  return error(value.message || 'Forbidden', value.statusCode || 403);
};
const requestMetadata = (ctx: Context) => ({
  ip: String(ctx.event?.requestContext?.http?.sourceIp || ctx.event?.headers?.['x-forwarded-for'] || ''),
  device: String(ctx.event?.headers?.['user-agent'] || ''),
});
const actorOf = (admin: { id?: string; account?: string; name?: string; role?: string }) => ({
  id: String(admin.id), account: String(admin.account || ''), name: String(admin.name || admin.account || '管理員'), role: String(admin.role || ''),
});
const bodyOf = (ctx: Context) => (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;

async function getAdmin(ctx: Context) {
  if (!ctx.admin) throw new AdminAccessError('管理員登入已失效', 401);
  return ctx.admin;
}
const sessionGuard = async (ctx: Context) => {
  try { ctx.admin = await credentialAuth.getAdminFromHeaders(ctx.event?.headers); }
  catch (cause) { return fail(cause); }
};
async function authorize(ctx: Context, permission: PermissionKey) {
  const admin = await getAdmin(ctx);
  requirePermission(admin, permission);
  return admin;
}
const guard = (permission: PermissionKey) => async (ctx: Context) => {
  try { await authorize(ctx, permission); }
  catch (cause) { return fail(cause); }
};
const moduleGuard = (module: ModuleKey, action: ModuleAction) => async (ctx: Context) => {
  try { requireModulePermission(await getAdmin(ctx), module, action); }
  catch (cause) { return fail(cause); }
};
const requireSuperRole = (message: string) => async (ctx: Context) => {
  try { if ((await getAdmin(ctx)).role !== '超級管理員') return error(message, 403); }
  catch (cause) { return fail(cause); }
};
const superGuard = requireSuperRole('僅超級管理員可管理管理員帳號');
const revenueResetGuard = requireSuperRole('僅超級管理員可重設收入');
function adminInput(body: Record<string, unknown>) {
  const permissions = (body.permissions ?? {}) as PermissionInput;
  return {
    account: String(body.account ?? ''), name: String(body.name ?? ''), role: String(body.role ?? '查看人員'), status: String(body.status ?? '啟用'),
    can_view: Boolean(permissions.view), can_add: Boolean(permissions.add), can_edit: Boolean(permissions.edit), can_delete: Boolean(permissions.delete),
  };
}
const legacyDurations: Record<string, string> = { '7': '7_days', '15': '15_days', '30': '30_days', '90': '90_days', '365': '365_days' };

const routes: Record<string, unknown> = {
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  'POST /api/admin-login': [async (ctx: Context) => {
    try {
      const body = bodyOf(ctx);
      const login = await credentialAuth.login(String(body.account ?? ''), String(body.password ?? ''));
      const lastLoginAt = now();
      if (shouldRecordAdminActivity(login.admin)) {
        await Promise.all([
          supabase.updateRows('admin_accounts', `id=eq.${encodeURIComponent(login.admin.id)}`, { last_login_at: lastLoginAt }),
          supabase.insertRows('admin_login_records', [{ admin_id: login.admin.id, account: login.admin.account, login_at: lastLoginAt, ...requestMetadata(ctx) }]),
        ]);
      }
      const response = json({ admin: { ...login.admin, lastLoginAt } });
      response.headers['Set-Cookie'] = credentialAuth.sessionCookie(login.token);
      return response;
    } catch (cause) { return fail(cause); }
  }],

  'POST /api/admin-logout': [async (ctx: Context) => {
    await credentialAuth.logout(ctx.event?.headers);
    const response = json({ signedOut: true });
    response.headers['Set-Cookie'] = credentialAuth.clearSessionCookie();
    return response;
  }],

  'POST /api/admin-credential-bootstrap': [requireAuth(), async (ctx: Context) => {
    try {
      const owner = await requireAdmin(ctx.user?.email, supabase);
      if (owner.role !== '超級管理員') return error('僅超級管理員可執行首次設定', 403);
      if (await credentialAuth.isConfigured(String(owner.id))) return error('此管理員已完成首次設定', 409);
      await credentialAuth.setPassword(String(owner.id), String(bodyOf(ctx).password ?? ''));
      return json({ configured: true, account: owner.account });
    } catch (cause) { return fail(cause); }
  }],

  'GET /api/bootstrap': [sessionGuard, async (ctx: Context) => {
    try { return json({ admin: await getAdmin(ctx) }); }
    catch (cause) { return fail(cause); }
  }],

  'GET /api/dashboard': [sessionGuard, guard('view'), async () => {
    try { return json(await getDashboard(supabase)); }
    catch (cause) { return fail(cause); }
  }],
  'POST /api/revenue/reset': [sessionGuard, revenueResetGuard, async (ctx: Context) => {
    try { return json(await adminData.resetRevenue(actorOf(await getAdmin(ctx)))); }
    catch (cause) { return fail(cause); }
  }],
  'GET /api/push-members': [sessionGuard, guard('view'), async () => {
    try { return json({ items: await pushNotifications.listMemberPushStatus() }); }
    catch (cause) { return fail(cause); }
  }],
  'POST /api/push-members/:id/test': [sessionGuard, guard('edit'), async (ctx: Context) => {
    try {
      const userId = requireMemberUuid(ctx.params.id);
      const admin = await getAdmin(ctx);
      return json(await pushNotifications.sendMemberTestPush(userId, String(admin.account ?? '')));
    } catch (cause) { return fail(cause); }
  }],
  'GET /api/push-delivery-logs': [sessionGuard, guard('view'), async () => {
    try { return json({ items: await pushNotifications.listPushDeliveryLogs() }); }
    catch (cause) { return fail(cause); }
  }],
  'PUT /api/me/name': [sessionGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json({ admin: await adminData.updateOwnAdminName(String(bodyOf(ctx).name ?? ''), actorOf(admin)) });
    } catch (cause) { return fail(cause); }
  }],
  'GET /api/system-status': [sessionGuard, moduleGuard('systemSettings', 'view'), async () => json(await connectionStatus.get())],
  'POST /api/system-status/:id/retry': [sessionGuard, moduleGuard('systemSettings', 'view'), async (ctx: Context) => {
    try { return json({ item: await connectionStatus.retry(ctx.params.id) }); }
    catch (cause) { return fail(cause); }
  }],
  'GET /api/data/:table': [sessionGuard, guard('view'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const modulesByTable: Partial<Record<string, ModuleKey>> = { users: 'users', subscriptions: 'subscriptions', plans: 'subscriptions', transferRequests: 'subscriptions', activationCodes: 'activationCodes', admins: 'admins' };
      const module = modulesByTable[ctx.params.table];
      if (module) requireModulePermission(admin, module, 'view');
      return json(await listAdminTable(ctx.params.table, supabase));
    } catch (cause) { return fail(cause); }
  }],
  'POST /api/data/:table': [sessionGuard, guard('add'), async () => error('此資料模組僅供檢視', 405)],
  'PUT /api/data/:table/:id': [sessionGuard, guard('edit'), async () => error('此資料模組僅供檢視', 405)],
  'DELETE /api/data/:table/:id': [sessionGuard, guard('delete'), async () => error('此資料模組僅供檢視', 405)],
  'POST /api/admins': [sessionGuard, superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const body = bodyOf(ctx);
      const credentials = await credentialAuth.passwordFields(String(body.password ?? ''), true);
      return json(await adminData.createAdminAccount({ ...adminInput(body), ...credentials }, actorOf(admin)), 201);
    } catch (cause) { return fail(cause); }
  }],
  'PUT /api/members/:id/status': [sessionGuard, moduleGuard('users', 'edit'), async (ctx: Context) => {
    try { return json(await adminData.updateMemberStatus(ctx.params.id, String(bodyOf(ctx).status ?? ''), actorOf(await getAdmin(ctx)))); }
    catch (cause) { return fail(cause); }
  }],
  'PUT /api/subscriptions/:id': [sessionGuard, moduleGuard('subscriptions', 'edit'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const body = bodyOf(ctx);
      return json(await adminData.updateSubscription(ctx.params.id, {
        action: String(body.action ?? '') as 'activate' | 'renew' | 'cancel' | 'adjustExpiry' | 'lifetime',
        planId: body.planId === undefined ? undefined : String(body.planId),
        expiresAt: body.expiresAt === undefined ? undefined : String(body.expiresAt),
      }, actorOf(admin)));
    } catch (cause) { return fail(cause); }
  }],
  'PUT /api/transfer-requests/:id': [sessionGuard, moduleGuard('subscriptions', 'edit'), async (ctx: Context) => {
    try { return json(await adminData.reviewTransferRequest(ctx.params.id, String(bodyOf(ctx).decision ?? ''), actorOf(await getAdmin(ctx)))); }
    catch (cause) { return fail(cause); }
  }],
  'PUT /api/admins/:id': [sessionGuard, superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const body = bodyOf(ctx);
      const credentials = await credentialAuth.passwordFields(String(body.password ?? ''), false);
      return json(await adminData.updateAdminAccount(ctx.params.id, { ...adminInput(body), ...credentials }, actorOf(admin)));
    } catch (cause) { return fail(cause); }
  }],
  'DELETE /api/admins/:id': [sessionGuard, superGuard, async (ctx: Context) => {
    try { await adminData.deleteAdminAccount(ctx.params.id, actorOf(await getAdmin(ctx))); return json({ deleted: true }); }
    catch (cause) { return fail(cause); }
  }],
  'POST /api/activation-codes/batch': [sessionGuard, moduleGuard('activationCodes', 'edit'), async (ctx: Context) => {
    try {
      const body = bodyOf(ctx);
      const rawDuration = String(body.durationType ?? body.durationDays ?? '30_days');
      return json(await adminData.generateActivationCodeBatch(legacyDurations[rawDuration] ?? rawDuration, actorOf(await getAdmin(ctx))));
    } catch (cause) { return fail(cause); }
  }],
  'DELETE /api/activation-codes/:id': [sessionGuard, moduleGuard('activationCodes', 'edit'), async (ctx: Context) => {
    try { return json(await adminData.deleteActivationCode(ctx.params.id, actorOf(await getAdmin(ctx)))); }
    catch (cause) { return fail(cause); }
  }],
};

export const handler = router(routes);
