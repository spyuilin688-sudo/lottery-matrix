import { db, error, json, requireAuth, router, secrets } from '@appdeploy/sdk';
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
import { createAdminTodos } from './admin-todos';
import { createAdminTransferPush } from './admin-transfer-push';
import { createAdminCredentialAuth, type CredentialAdmin } from './admin-credential-auth';
import { createConnectionStatus } from './connection-status';
import { createNotificationEvents, getNotificationEventConfig } from './notification-events';
import { createPushNotifications, requireMemberUuid } from './push-notifications';
import { createSupabaseTransport, getSupabaseConfig } from './supabase';
import { createWorkerApi, getWorkerConfig, type CrawlerLottery } from './worker-api';
import {
  createFantasy5GithubDispatcher,
  createIndependentWatchdog,
  createSupabaseWatchdogLeaseManager,
  createSupabaseWatchdogSnapshotLoader,
  expectedDrawDateForDueWindow,
  getGithubActionsToken,
  type WatchdogLottery,
} from './watchdog';
import { createWatchdogStatusStore, type WatchdogStatus } from './watchdog-status';

type Context = {
  body?: unknown;
  query?: Record<string, string>;
  event?: {
    headers?: Record<string, string | undefined>;
    requestContext?: { http?: { sourceIp?: string } };
  };
  params: Record<string, string>;
  user?: { email?: string | null };
  admin?: CredentialAdmin;
};

type PermissionInput = {
  view?: boolean;
  add?: boolean;
  edit?: boolean;
  delete?: boolean;
};

const supabase = createSupabaseTransport(() => getSupabaseConfig(secrets));
const adminTransferPush = createAdminTransferPush(() => getSupabaseConfig(secrets));
const pushNotifications = createPushNotifications(() => getSupabaseConfig(secrets));
const notificationEvents = createNotificationEvents(() => getNotificationEventConfig(secrets));
const adminData = createAdminData(supabase);
const adminTodos = createAdminTodos(supabase);
const credentialAuth = createAdminCredentialAuth(supabase);
const workerApi = createWorkerApi(() => getWorkerConfig(secrets));
const watchdogLeases = createSupabaseWatchdogLeaseManager(supabase);
const independentWatchdog = createIndependentWatchdog({
  loadSnapshot: createSupabaseWatchdogSnapshotLoader(supabase),
  claimLease: (key, owner) => watchdogLeases.claim(key, owner),
  releaseLease: (key, owner) => watchdogLeases.release(key, owner),
  recoverRailway: (lottery, owner) => workerApi.recoverLottery(lottery, owner),
  dispatchFantasy5: createFantasy5GithubDispatcher(
    () => getGithubActionsToken(secrets),
  ),
});
const watchdogStatus = createWatchdogStatusStore(db);
const connectionStatus = createConnectionStatus({
  supabase,
  loadConfig: () => getSupabaseConfig(secrets),
  getWorkerStatus: () => workerApi.getStatus(),
  loadWatchdogStatus: () => watchdogStatus.load(),
  loadGithubToken: () => getGithubActionsToken(secrets),
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
  try {
    await authorize(ctx, permission);
  } catch (cause) {
    return fail(cause);
  }
};

const moduleGuard = (module: ModuleKey, action: ModuleAction, operation?: PermissionKey) => async (ctx: Context) => {
  try {
    const admin = await getAdmin(ctx);
    requireModulePermission(admin, module, action);
    if (operation) requirePermission(admin, operation);
  } catch (cause) {
    return fail(cause);
  }
};

const requireSuperRole = (message: string) => async (ctx: Context) => {
  try {
    const admin = await getAdmin(ctx);
    if (admin.role !== '超級管理員') return error(message, 403);
  } catch (cause) {
    return fail(cause);
  }
};
const superGuard = requireSuperRole('僅超級管理員可管理管理員帳號');
const transferPushGuard = requireSuperRole('僅超級管理員可管理匯款推播通知');
const revenueResetGuard = requireSuperRole('僅超級管理員可重設收入');

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
  '60': '60_days',
  '90': '90_days',
  '365': '365_days',
};
const crawlerLotteryByStatusId: Record<string, CrawlerLottery> = {
  'cron-matrix-539-refresh-v2': '今彩539',
  'cron-matrix-fantasy5-refresh-v2': '天天樂',
  'cron-matrix-marksix-refresh-v2': '六合彩',
  'cron-matrix-649-refresh-v2': '大樂透',
};
const watchdogLotteries: WatchdogLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

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

  'GET /api/todos': [sessionGuard, async (ctx: Context) => {
    try {
      await getAdmin(ctx);
      return json({ items: await adminTodos.list() });
    } catch (cause) { return fail(cause); }
  }],

  'POST /api/todos': [sessionGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const item = await adminTodos.create(bodyOf(ctx).content, actorOf(admin));
      return json({ item }, 201);
    } catch (cause) { return fail(cause); }
  }],

  'PUT /api/todos/:id': [sessionGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const item = await adminTodos.update(ctx.params.id, bodyOf(ctx).content, actorOf(admin));
      return json({ item });
    } catch (cause) { return fail(cause); }
  }],

  'DELETE /api/todos/:id': [sessionGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const removed = await adminTodos.remove(ctx.params.id, actorOf(admin));
      return json({ deleted: true, id: removed.id });
    } catch (cause) { return fail(cause); }
  }],

  'GET /api/dashboard': [sessionGuard, guard('view'), async () => {
    try {
      return json(await getDashboard(supabase));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/revenue/reset': [sessionGuard, revenueResetGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminData.resetRevenue(actorOf(admin)));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'GET /api/admin-transfer-push': [sessionGuard, transferPushGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminTransferPush.getConfig(admin.id, ctx.query?.endpoint));
    } catch (cause) { return fail(cause); }
  }],

  'POST /api/admin-transfer-push': [sessionGuard, transferPushGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminTransferPush.enable(admin.id, bodyOf(ctx).subscription));
    } catch (cause) { return fail(cause); }
  }],

  'DELETE /api/admin-transfer-push': [sessionGuard, transferPushGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminTransferPush.disable(admin.id, bodyOf(ctx).endpoint));
    } catch (cause) { return fail(cause); }
  }],

  'GET /api/push-members': [sessionGuard, guard('view'), async () => {
    try {
      return json({ items: await pushNotifications.listMemberPushStatus() });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/push-members/:id/test': [sessionGuard, guard('edit'), async (ctx: Context) => {
    try {
      const userId = requireMemberUuid(ctx.params.id);
      const admin = await getAdmin(ctx);
      return json(await pushNotifications.sendMemberTestPush(
        userId,
        String(admin.account ?? ''),
      ));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'GET /api/push-delivery-logs': [sessionGuard, guard('view'), async () => {
    try {
      return json({ items: await pushNotifications.listPushDeliveryLogs() });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/system-notices': [sessionGuard, guard('edit'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const notice = await notificationEvents.sendSystemNotice(bodyOf(ctx));
      if (shouldRecordAdminActivity(admin)) {
        try {
          const actor = actorOf(admin);
          await supabase.insertRows('audit_logs', [{
            admin_id: actor.id,
            admin: actor.name || actor.account,
            operation_type: '發送系統通知',
            target_table: 'notification_events',
            target_id: notice.eventKey,
            content: `${notice.category}：${notice.title}`,
            before_data: null,
            after_data: notice,
            ...requestMetadata(ctx),
          }]);
        } catch {
          // An accepted event must not look failed only because audit storage is down.
        }
      }
      return json({ notice }, 201);
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/me/name': [sessionGuard, async (ctx: Context) => {
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

  'GET /api/system-status': [sessionGuard, moduleGuard('systemSettings', 'view'), async () =>
    json(await connectionStatus.get())],

  'POST /api/system-status/:id/retry': [sessionGuard, moduleGuard('systemSettings', 'view'), async (ctx: Context) => {
    try {
      return json({ item: await connectionStatus.retry(ctx.params.id) });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/system-status/:id/refresh': [sessionGuard, guard('edit'), async (ctx: Context) => {
    const lottery = crawlerLotteryByStatusId[ctx.params.id];
    if (!lottery) return error('此項目不支援資料更新', 400);
    try {
      const admin = await getAdmin(ctx);
      const refresh = await workerApi.refreshLottery(lottery);
      if (shouldRecordAdminActivity(admin)) {
        try {
          const actor = actorOf(admin);
          await supabase.insertRows('audit_logs', [{
            admin_id: actor.id,
            admin: actor.name || actor.account,
            operation_type: '手動更新',
            target_table: 'lottery_draws',
            target_id: refresh.period,
            content: `更新${refresh.lottery}最新開獎資料`,
            before_data: null,
            after_data: refresh,
            ...requestMetadata(ctx),
          }]);
        } catch {
          // A completed crawler refresh must not look failed only because audit storage is down.
        }
      }
      return json({ refresh });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'GET /api/data/:table': [sessionGuard, guard('view'), async (ctx: Context) => {
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

  'POST /api/data/:table': [sessionGuard, guard('add'), async () =>
    error('此資料模組僅供檢視', 405)],
  'PUT /api/data/:table/:id': [sessionGuard, guard('edit'), async () =>
    error('此資料模組僅供檢視', 405)],
  'DELETE /api/data/:table/:id': [sessionGuard, guard('delete'), async () =>
    error('此資料模組僅供檢視', 405)],

  'POST /api/admins': [sessionGuard, superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const body = bodyOf(ctx);
      const credentials = await credentialAuth.passwordFields(String(body.password ?? ''), true);
      const created = await adminData.createAdminAccount({ ...adminInput(body), ...credentials }, actorOf(admin));
      return json(created, 201);
    } catch (cause) {
      return fail(cause);
    }
  }],

  'PUT /api/members/:id/status': [sessionGuard, moduleGuard('users', 'edit', 'edit'), async (ctx: Context) => {
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

  'PUT /api/subscriptions/:id': [sessionGuard, moduleGuard('subscriptions', 'edit', 'edit'), async (ctx: Context) => {
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

  'PUT /api/transfer-requests/:id': [sessionGuard, moduleGuard('subscriptions', 'edit', 'edit'), async (ctx: Context) => {
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

  'PUT /api/admins/:id': [sessionGuard, superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      const body = bodyOf(ctx);
      const credentials = await credentialAuth.passwordFields(String(body.password ?? ''), false);
      const updated = await adminData.updateAdminAccount(ctx.params.id, { ...adminInput(body), ...credentials }, actorOf(admin));
      return json(updated);
    } catch (cause) {
      return fail(cause);
    }
  }],

  'DELETE /api/admins/:id': [sessionGuard, superGuard, async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      await adminData.deleteAdminAccount(ctx.params.id, actorOf(admin));
      return json({ deleted: true });
    } catch (cause) {
      return fail(cause);
    }
  }],

  'POST /api/activation-codes/batch': [sessionGuard, moduleGuard('activationCodes', 'edit', 'add'), async (ctx: Context) => {
    try {
      const body = bodyOf(ctx);
      const rawDuration = String(body.durationType ?? body.durationDays ?? '30_days');
      const durationType = legacyDurations[rawDuration] ?? rawDuration;
      const quantity = Number(body.quantity ?? 10);
      const admin = await getAdmin(ctx);
      return json(await adminData.generateActivationCodeBatch(durationType, quantity, actorOf(admin)));
    } catch (cause) {
      return fail(cause);
    }
  }],

  'DELETE /api/activation-codes/:id': [sessionGuard, moduleGuard('activationCodes', 'edit', 'delete'), async (ctx: Context) => {
    try {
      const admin = await getAdmin(ctx);
      return json(await adminData.deleteActivationCode(ctx.params.id, actorOf(admin)));
    } catch (cause) {
      return fail(cause);
    }
  }],
};

export const matrixIndependentWatchdog = async (
  event: { scheduledTime?: string; invocationId?: string },
) => {
  const scheduled = event?.scheduledTime ? new Date(event.scheduledTime) : new Date();
  const at = Number.isNaN(scheduled.getTime()) ? new Date() : scheduled;
  const owner = event?.invocationId || `cron:${at.toISOString()}`;
  const dueLotteries = watchdogLotteries.filter((lottery) =>
    expectedDrawDateForDueWindow(lottery, at) !== null);
  let watchdogResult: Record<string, unknown>;
  try {
    watchdogResult = { ...await independentWatchdog.run(at, owner) };
  } catch {
    watchdogResult = {
      status: 'degraded',
      checkedAt: at.toISOString(),
      actions: [],
      error: 'WATCHDOG_FAILED',
    };
  }
  const completedAt = new Date().toISOString();
  const heartbeat = { ...watchdogResult, completedAt, dueLotteries };
  let result: WatchdogStatus;
  try {
    result = await watchdogStatus.save(heartbeat);
  } catch {
    result = {
      status: 'degraded',
      checkedAt: at.toISOString(),
      completedAt,
      dueLotteries,
      actions: [],
      error: 'WATCHDOG_STATUS_WRITE_FAILED',
    };
  }
  const log = result.status === 'ok' ? console.log : console.error;
  log(`matrix-independent-watchdog ${JSON.stringify(result)}`);
  return { statusCode: 200 };
};

export const handler = router(routes);
