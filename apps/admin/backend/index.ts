import { error, json, requireAuth, router, secrets } from '@appdeploy/sdk';
import {
  requireAdmin,
  requireModulePermission,
  requirePermission,
  shouldRecordAdminActivity,
  type ModuleAction,
  type ModuleKey,
  type PermissionKey,
} from './admin-auth';
import { createAdminData, getDashboard, listAdminTable } from './admin-data';
import { algorithmApi } from './algorithm-api';
import { createConnectionStatus } from './connection-status';
import { createSupabaseTransport, getSupabaseConfig } from './supabase';

type Context = {
  body?: unknown;
  event?: {
    headers?: Record<string, string | undefined>;
    requestContext?: { http?: { sourceIp?: string } };
  };
  params: Record<string, string>;
  user?: { email?: string | null };
};

type PermissionInput = {
  view?: boolean;
  add?: boolean;
  edit?: boolean;
  delete?: boolean;
};

const supabase = createSupabaseTransport(() => getSupabaseConfig(secrets));
const adminData = createAdminData(supabase);
const connectionStatus = createConnectionStatus({
  supabase,
  loadConfig: () => getSupabaseConfig(secrets),
});
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
  id: String(admin.id),
  account: String(admin.account || ''),
  name: String(admin.name || admin.account || '管理員'),
  role: String(admin.role || ''),
});
const bodyOf = (ctx: Context) =>
  (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;

async function getAdmin(ctx: Context) {
  return requireAdmin(ctx.user?.email, supabase);
}

async function authorize(ctx: Context, permission: PermissionKey) {
  const admin = await getAdmin(ctx);
  requirePermission(admin, permission);
  return admin;
}

const guard = (permission: PermissionKey) => async (ctx: Context) => {
  try {
    await authorize(ctx, permission);
  } catch (cause) {
    return fail(cause);
  }
};

const moduleGuard = (module: ModuleKey, action: ModuleAction) => async (ctx: Context) => {
  try {
    const admin = await getAdmin(ctx);
    requireModulePermission(admin, module, action);
  } catch (cause) {
    return fail(cause);
  }
};

const superGuard = async (ctx: Context) => {
  try {
    const admin = await getAdmin(ctx);
    if (admin.role !== '超級管理員') return error('僅超級管理員可管理管理員帳號', 403);
  } catch (cause) {
    return fail(cause);
  }
};

function adminInput(body: Record<string, unknown>) {
  const permissions = (body.permissions ?? {}) as PermissionInput;
  return {
    account: String(body.account ?? ''),
    name: String(body.name ?? ''),
    role: String(body.role ?? '查看人員'),
    status: String(body.status ?? '啟用'),
    can_view: Boolean(permissions.view),
    can_add: Boolean(permissions.add),
    can_edit: Boolean(permissions.edit),
    can_delete: Boolean(permissions.delete),
  };
}

const legacyDurations: Record<string, string> = {
  '7': '7_days',
  '15': '15_days',
  '30': '30_days',
  '90': '90_days',
  '365': '365_days',
};

const routes: Record<string, unknown> = {
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  'GET /api/bootstrap': [requireAuth(), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const lastLoginAt = now();
      if (shouldRecordAdminActivity(admin)) {
        await Promise.all([
          supabase.updateRows('admin_accounts', `id=eq.${encodeURIComponent(String(admin.id))}`, {
            last_login_at: lastLoginAt,
          }),
          supabase.insertRows('admin_login_records', [{
            admin_id: admin.id,
            account: admin.account,
            login_at: lastLoginAt,
            ...requestMetadata(ctx),
          }]),
        ]);
      }
      return json({ admin: { ...admin, lastLoginAt } });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'GET /api/dashboard': [requireAuth(), guard('view'), async () => {
    try {
      return json(await getDashboard(supabase));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/me/name': [requireAuth(), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const updated = await adminData.updateOwnAdminName(
        String(bodyOf(ctx).name ?? ''),
        actorOf(admin),
      );
      return json({ admin: updated });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'GET /api/algorithm-status': [requireAuth(), guard('view'), async () =>
    json(await algorithmApi.getAlgorithmStatus())],

  'GET /api/system-status': [requireAuth(), moduleGuard('systemSettings', 'view'), async () =>
    json(await connectionStatus.get())],

  'POST /api/system-status/:id/retry': [requireAuth(), moduleGuard('systemSettings', 'view'), async (ctx: Context) => {
    try {
      return json({ item: await connectionStatus.retry(ctx.params.id) });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'GET /api/data/:table': [requireAuth(), guard('view'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const modulesByTable: Partial<Record<string, ModuleKey>> = {
        users: 'users',
        subscriptions: 'subscriptions',
        plans: 'subscriptions',
        transferRequests: 'subscriptions',
        activationCodes: 'activationCodes',
        admins: 'admins',
      };
      const module = modulesByTable[ctx.params.table];
      if (module) requireModulePermission(admin, module, 'view');
      return json(await listAdminTable(ctx.params.table, supabase));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/data/:table': [requireAuth(), guard('add'), async () =>
    error('此資料模組僅供檢視', 405)],
  'PUT /api/data/:table/:id': [requireAuth(), guard('edit'), async () =>
    error('此資料模組僅供檢視', 405)],
  'DELETE /api/data/:table/:id': [requireAuth(), guard('delete'), async () =>
    error('此資料模組僅供檢視', 405)],

  'POST /api/admins': [requireAuth(), superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const created = await adminData.createAdminAccount(adminInput(bodyOf(ctx)), actorOf(admin));
      return json(created, 201);
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/members/:id/status': [requireAuth(), moduleGuard('users', 'edit'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminData.updateMemberStatus(
        ctx.params.id,
        String(bodyOf(ctx).status ?? ''),
        actorOf(admin),
      ));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/subscriptions/:id': [requireAuth(), moduleGuard('subscriptions', 'edit'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const body = bodyOf(ctx);
      return json(await adminData.updateSubscription(ctx.params.id, {
        action: String(body.action ?? '') as 'activate' | 'renew' | 'cancel' | 'adjustExpiry' | 'lifetime',
        planId: body.planId === undefined ? undefined : String(body.planId),
        expiresAt: body.expiresAt === undefined ? undefined : String(body.expiresAt),
      }, actorOf(admin)));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/transfer-requests/:id': [requireAuth(), moduleGuard('subscriptions', 'edit'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminData.reviewTransferRequest(
        ctx.params.id,
        String(bodyOf(ctx).decision ?? ''),
        actorOf(admin),
      ));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/admins/:id': [requireAuth(), superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminData.updateAdminAccount(
        ctx.params.id,
        adminInput(bodyOf(ctx)),
        actorOf(admin),
      ));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'DELETE /api/admins/:id': [requireAuth(), superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      await adminData.deleteAdminAccount(ctx.params.id, actorOf(admin));
      return json({ deleted: true });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/activation-codes/batch': [requireAuth(), moduleGuard('activationCodes', 'edit'), async (ctx: Context) => {
    try {
      const body = bodyOf(ctx);
      const rawDuration = String(body.durationType ?? body.durationDays ?? '30_days');
      const durationType = legacyDurations[rawDuration] ?? rawDuration;
      const admin = await getAdmin(ctx);
      return json(await adminData.generateActivationCodeBatch(durationType, actorOf(admin)));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'DELETE /api/activation-codes/:id': [requireAuth(), moduleGuard('activationCodes', 'edit'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminData.deleteActivationCode(ctx.params.id, actorOf(admin)));
    } catch (cause) {
      return fail(cause);
    }
  }],
};

export const handler = router(routes);
