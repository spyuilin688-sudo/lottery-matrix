import { describe, expect, it, vi } from 'vitest';

const securityWiring = vi.hoisted(() => ({ check: vi.fn(async () => ({allowed:true,retryAfter:0,mode:'observe'})), observe:vi.fn(async () => undefined) }));
vi.mock('./security-monitor', () => ({createSecurityMonitor: () => securityWiring}));

const wiring = vi.hoisted(() => {
  const workerStatus = { ok: false, health: null, jobs: null, reason: 'RAILWAY_UNAVAILABLE' } as const;
  const workerGetStatus = vi.fn(async () => workerStatus);
  const workerRefreshLottery = vi.fn(async (lottery: string) => ({ lottery, requestId: '11111111-1111-4111-8111-111111111111', status: 'accepted', period: null, drawDate: null, error: null }));
  const workerRecoverLottery = vi.fn(async (lottery: string, _leaseOwner: string) => ({ lottery, status: 'accepted' }));
  const workerRunPrimary = vi.fn(async (group: string) => ({ group, status: 'accepted' }));
  const workerRefreshMarkSixCalendar = vi.fn(async () => ({ lottery: '六合彩', status: 'synced', days: 30 }));
  const getWorkerConfig = vi.fn(async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }));
  const createWorkerApi = vi.fn(() => ({
    getStatus: workerGetStatus,
    refreshLottery: workerRefreshLottery,
    recoverLottery: workerRecoverLottery,
    refreshMarkSixCalendar: workerRefreshMarkSixCalendar,
    runPrimary: workerRunPrimary,
  }));
  const insertRows = vi.fn(async () => []);
  const updateRows = vi.fn(async () => []);
  const supabaseRequest = vi.fn(async () => []);
  const requestPage = vi.fn(async (_path: string) => ({ items: [], total: 61 }));
  const createSupabaseTransport = vi.fn(() => ({
    request: vi.fn(async () => []), requestPage,
    selectRows: vi.fn(async () => []), insertRows, updateRows, deleteRows: vi.fn(async () => []), supabaseRequest,
  }));
  const connectionGet = vi.fn(async () => ({ checkedAt: 'test', items: [] }));
  const connectionRetry = vi.fn(async () => ({ id: 'test' }));
  const createConnectionStatus = vi.fn(() => ({ get: connectionGet, retry: connectionRetry }));
  const admin = { id: 'admin-1', account: 'admin@example.com', name: '管理員', role: '超級管理員' };
  const requireAdmin = vi.fn(async () => admin);
  const requirePermission = vi.fn();
  const requireModulePermission = vi.fn();
  const shouldRecordAdminActivity = vi.fn(() => false);
  const getAdminFromHeaders = vi.fn(async () => admin);
  const createAdminCredentialAuth = vi.fn(() => ({
    getAdminFromHeaders,
    login: vi.fn(),
    revokeLogin: vi.fn(async () => undefined),
    logout: vi.fn(),
    sessionCookie: vi.fn(() => 'admin_session=test; HttpOnly'),
    clearSessionCookie: vi.fn(() => 'admin_session=; Max-Age=0'),
    isConfigured: vi.fn(async () => false),
    setPassword: vi.fn(async () => undefined),
    passwordFields: vi.fn(async () => ({ password_salt: 'salt', password_hash: 'hash' })),
  }));
  const listMemberPushStatus = vi.fn(async () => ({ items: [{ userId: 'member-1' }], total: 1, currentPage: 1, totalPages: 1 }));
  const sendMemberTestPush = vi.fn(async () => ({ sent: 1, failed: 0 }));
  const listPushDeliveryLogs = vi.fn(async () => [{ id: 'log-1' }]);
  const createPushNotifications = vi.fn(() => ({ listMemberPushStatus, sendMemberTestPush, listPushDeliveryLogs }));
  const notice = {
    noticeId: '11111111-1111-4111-8111-111111111111',
    eventKey: 'system_notice:11111111-1111-4111-8111-111111111111',
    category: '更新',
    title: '系統更新',
    body: '新功能已上線。',
    occurredAt: '2026-09-04T04:20:00.000Z',
  } as const;
  const sendSystemNotice = vi.fn(async () => notice);
  const getNotificationEventConfig = vi.fn(async () => ({
    supabaseUrl: 'https://supabase.example',
    ingestToken: 'server-only-ingest-token',
  }));
  const createNotificationEvents = vi.fn(() => ({ sendSystemNotice }));
  const watchdogRun = vi.fn(async () => ({ status: 'ok', checkedAt: '2026-09-04T01:33:00.000Z', dueLotteries: [] as string[], actions: [] }));
  const createIndependentWatchdog = vi.fn(() => ({ run: watchdogRun }));
  const expectedDrawDateForDueWindow = vi.fn((lottery: string) =>
    lottery === '今彩539' ? '2026-09-04' : null);
  const watchdogStatusLoad = vi.fn(async () => null);
  const watchdogStatusSave = vi.fn(async (status: unknown) => status);
  const createWatchdogStatusStore = vi.fn(() => ({
    load: watchdogStatusLoad,
    save: watchdogStatusSave,
  }));
  const loadWatchdogSnapshot = vi.fn(async () => []);
  const createSupabaseWatchdogSnapshotLoader = vi.fn(() => loadWatchdogSnapshot);
  const watchdogLeaseClaim = vi.fn(async () => true);
  const watchdogLeaseRelease = vi.fn(async () => undefined);
  const createSupabaseWatchdogLeaseManager = vi.fn(() => ({ claim: watchdogLeaseClaim, release: watchdogLeaseRelease }));
  const dispatchFantasy5 = vi.fn(async () => 'dispatched');
  const createFantasy5GithubDispatcher = vi.fn(() => dispatchFantasy5);
  const getGithubActionsToken = vi.fn(async () => 'server-only-token');
  const todoList = vi.fn(async () => [{ id: 'todo-1', content: '待處理' }]);
  const todoCreate = vi.fn(async () => ({ id: 'todo-2', content: '新事項' }));
  const todoUpdate = vi.fn(async () => ({ id: 'todo-1', content: '已更新' }));
  const todoRemove = vi.fn(async () => ({ id: 'todo-1' }));
  const createAdminTodos = vi.fn(() => ({
    list: todoList,
    create: todoCreate,
    update: todoUpdate,
    remove: todoRemove,
  }));
  return {
    workerGetStatus, workerRefreshLottery, workerRecoverLottery, workerRunPrimary, workerRefreshMarkSixCalendar, getWorkerConfig, createWorkerApi, insertRows, updateRows, supabaseRequest,
    createSupabaseTransport, requestPage, createConnectionStatus, admin, requireAdmin, requirePermission, requireModulePermission,
    shouldRecordAdminActivity, getAdminFromHeaders, createAdminCredentialAuth, listMemberPushStatus,
    sendMemberTestPush, listPushDeliveryLogs, createPushNotifications,
    todoList, todoCreate, todoUpdate, todoRemove, createAdminTodos,
    notice, sendSystemNotice, getNotificationEventConfig, createNotificationEvents,
    watchdogRun, createIndependentWatchdog, expectedDrawDateForDueWindow, loadWatchdogSnapshot,
    watchdogStatusLoad, watchdogStatusSave, createWatchdogStatusStore,
    createSupabaseWatchdogSnapshotLoader, createSupabaseWatchdogLeaseManager,
    watchdogLeaseClaim, watchdogLeaseRelease, dispatchFantasy5,
    createFantasy5GithubDispatcher, getGithubActionsToken,
  };
});

const sdk = vi.hoisted(() => {
  const requireAuth = vi.fn(() => Object.assign(vi.fn(), { auth: true as const }));
  return {
    requireAuth,
    router: vi.fn((registeredRoutes: Record<string, unknown[]>) => registeredRoutes),
    json: vi.fn((body: unknown, status = 200) => ({ body, status, headers: {} as Record<string, string> })),
    error: vi.fn((message: string, status = 500) => ({ error: message, status })),
    secrets: { kind: 'test-secrets' },
    db: { kind: 'test-db' },
  };
});

vi.mock('../../../supabase/functions/admin-api/runtime.ts', () => sdk);
vi.mock('./worker-api', () => ({ createWorkerApi: wiring.createWorkerApi, getWorkerConfig: wiring.getWorkerConfig, PRODUCTION_RAILWAY_API_BASE: 'https://public-api.example' }));
vi.mock('./supabase', () => ({
  createSupabaseTransport: wiring.createSupabaseTransport,
  getSupabaseConfig: vi.fn(async () => ({ url: 'https://supabase.example', serviceRoleKey: 'service-role-key' })),
}));
vi.mock('./connection-status', () => ({ createConnectionStatus: wiring.createConnectionStatus }));
vi.mock('./admin-credential-auth', () => ({ createAdminCredentialAuth: wiring.createAdminCredentialAuth }));
vi.mock('./admin-auth', () => {
  class AdminAccessError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 403) { super(message); this.statusCode = statusCode; }
  }
  return {
    AdminAccessError,
    requireAdmin: wiring.requireAdmin,
    requirePermission: wiring.requirePermission,
    requireModulePermission: wiring.requireModulePermission,
    shouldRecordAdminActivity: wiring.shouldRecordAdminActivity,
  };
});
vi.mock('./push-notifications', async (importOriginal) => ({
  ...await importOriginal<typeof import('./push-notifications')>(),
  createPushNotifications: wiring.createPushNotifications,
}));
vi.mock('./admin-todos', () => ({ createAdminTodos: wiring.createAdminTodos }));
vi.mock('./notification-events', () => ({
  createNotificationEvents: wiring.createNotificationEvents,
  getNotificationEventConfig: wiring.getNotificationEventConfig,
}));
vi.mock('./watchdog', () => ({
  createIndependentWatchdog: wiring.createIndependentWatchdog,
  createSupabaseWatchdogSnapshotLoader: wiring.createSupabaseWatchdogSnapshotLoader,
  createSupabaseWatchdogLeaseManager: wiring.createSupabaseWatchdogLeaseManager,
  createFantasy5GithubDispatcher: wiring.createFantasy5GithubDispatcher,
  getGithubActionsToken: wiring.getGithubActionsToken,
  expectedDrawDateForDueWindow: wiring.expectedDrawDateForDueWindow,
}));
vi.mock('./watchdog-status', () => ({
  createWatchdogStatusStore: wiring.createWatchdogStatusStore,
}));

import { handler, matrixIndependentWatchdog } from './index';
const routes = handler as unknown as Record<string, unknown[]>;

it('bootstraps the designated owner password through the guarded operation', async () => {
  const protectedOwner = { id: 'protected-owner', account: 'spyuilin688@gmail.com', name: 'Owner',
    role: '超級管理員', status: '啟用', revision: 0 };
  wiring.requireAdmin.mockResolvedValueOnce(protectedOwner);
  const transport = wiring.createSupabaseTransport.mock.results[0].value;
  transport.selectRows.mockResolvedValueOnce([protectedOwner]).mockResolvedValueOnce([protectedOwner]);
  wiring.supabaseRequest.mockClear();
  wiring.updateRows.mockClear();
  wiring.supabaseRequest.mockResolvedValueOnce(protectedOwner);
  const routeHandler = routes['POST /api/admin-credential-bootstrap'][1] as (ctx: unknown) => Promise<unknown>;
  expect(await routeHandler({ user: { email: protectedOwner.account }, body: { password: 'test-password' } }))
    .toMatchObject({ status: 200, body: { configured: true, account: protectedOwner.account } });
  expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/admin_update_private_activation_owner_password',
    expect.objectContaining({ method: 'POST', body: expect.stringContaining('"p_actor_id":"protected-owner"') }));
  expect(wiring.updateRows).not.toHaveBeenCalledWith('admin_accounts', expect.anything(), expect.objectContaining({ password_hash: expect.anything() }));
});

describe('manual Railway recovery route', () => {
  const route = 'POST /api/system-status/:id/recover';
  const execute = async (id = 'cron-matrix-539-refresh-v2') => {
    const ctx = sessionContext({ id });
    for (const middleware of routes[route] as Array<(ctx: unknown) => Promise<unknown>>) {
      const result = await middleware(ctx);
      if (result) return result;
    }
  };
  it('exposes an authenticated recovery route', () => {
    expect(routes).toHaveProperty(route);
  });
  it('claims the same watchdog lease and reports acceptance, without declaring completion', async () => {
    wiring.workerRecoverLottery.mockClear();
    wiring.watchdogLeaseClaim.mockClear();
    await expect(execute()).resolves.toMatchObject({ body: { recovery: { lottery: '今彩539', status: 'accepted' } } });
    expect(wiring.watchdogLeaseClaim).toHaveBeenCalledWith('railway:今彩539', expect.any(String));
    const owner = wiring.watchdogLeaseClaim.mock.calls[0][1];
    expect(owner).toMatch(/^admin-manual:/);
    expect(wiring.workerRecoverLottery).toHaveBeenCalledExactlyOnceWith('今彩539', owner);
  });
  it('does not enqueue when another recovery holds the lease', async () => {
    wiring.workerRecoverLottery.mockClear();
    wiring.watchdogLeaseClaim.mockResolvedValueOnce(false);
    await expect(execute()).resolves.toMatchObject({ body: { recovery: { status: 'already-running' } } });
    expect(wiring.workerRecoverLottery).not.toHaveBeenCalled();
  });
  it('rejects invalid targets before acquiring a lease', async () => {
    wiring.watchdogLeaseClaim.mockClear();
    await expect(execute('railway-health')).resolves.toMatchObject({ status: 400 });
    expect(wiring.watchdogLeaseClaim).not.toHaveBeenCalled();
  });
  it('rejects missing edit permission before starting work', async () => {
    wiring.workerRecoverLottery.mockClear();
    wiring.requirePermission.mockImplementationOnce(() => { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }); });
    await expect(execute()).resolves.toMatchObject({ status: 403 });
    expect(wiring.workerRecoverLottery).not.toHaveBeenCalled();
  });
  it('retains the lease on an ambiguous Railway timeout', async () => {
    wiring.watchdogLeaseRelease.mockClear();
    wiring.workerRecoverLottery.mockRejectedValueOnce(Object.assign(new Error('復原回應逾時'), { statusCode: 503 }));
    await expect(execute()).resolves.toMatchObject({ status: 503 });
    expect(wiring.watchdogLeaseRelease).not.toHaveBeenCalled();
  });
});
const sessionContext = (params: Record<string, string> = {}) => ({
  params,
  event: { headers: { cookie: 'admin_session=test', 'user-agent': 'test-agent' }, requestContext: { http: { sourceIp: '127.0.0.1' } } },
});

describe('hidden activation code API authorization', () => {
  const execute = async (route: string, ctx: Record<string, unknown>) => {
    for (const middleware of routes[route] as Array<(value: unknown) => Promise<unknown>>) {
      const result = await middleware(ctx);
      if (result) return result;
    }
  };

  it('rejects direct hidden list access for another super administrator before database read', async () => {
    const previous = wiring.admin.account;
    wiring.admin.account = 'other@example.com';
    wiring.requestPage.mockClear();
    try {
      const result = await execute('GET /api/data/:table', sessionContext({ table: 'privateActivationCodes' }));
      expect(result).toMatchObject({ status: 403 });
      expect(wiring.requestPage).not.toHaveBeenCalled();
    } finally { wiring.admin.account = previous; }
  });

  it('requires the designated account for hidden batch creation even with a forged request', async () => {
    const previous = wiring.admin.account;
    wiring.admin.account = 'other@example.com';
    wiring.supabaseRequest.mockClear();
    try {
      const result = await execute('POST /api/activation-codes/batch', {
        ...sessionContext(), body: { durationType: 'lifetime', quantity: 1, requestId: crypto.randomUUID(), private: true },
      });
      expect(result).toMatchObject({ status: 403 });
      expect(wiring.supabaseRequest).not.toHaveBeenCalledWith('rpc/admin_generate_activation_code_batch', expect.anything());
    } finally { wiring.admin.account = previous; }
  });
});

describe('system settings mutation authorization', () => {
  it.each([
    'POST /api/system-status/:id/refresh',
    'POST /api/system-status/:id/recover',
  ])('requires systemSettings edit permission for %s', async (route) => {
    const context = sessionContext({ id: 'cron-matrix-539-refresh-v2' });
    await (routes[route][0] as (ctx: typeof context) => Promise<unknown>)(context);
    wiring.requireModulePermission.mockClear();
    wiring.requirePermission.mockClear();
    await (routes[route][1] as (ctx: typeof context) => Promise<unknown>)(context);
    expect(wiring.requireModulePermission).toHaveBeenCalledWith(wiring.admin, 'systemSettings', 'edit');
    expect(wiring.requirePermission).toHaveBeenCalledWith(wiring.admin, 'edit');
  });
});

async function authenticate(route: string, context: ReturnType<typeof sessionContext>) {
  const middleware = routes[route][0] as (input: typeof context) => Promise<unknown>;
  await middleware(context);
  return context as typeof context & { admin: typeof wiring.admin };
}

describe('independent watchdog cron wiring', () => {
  it('persists the latest successful heartbeat and completes with HTTP 200', async () => {
    expect(wiring.createIndependentWatchdog).toHaveBeenCalledTimes(1);
    expect(wiring.createSupabaseWatchdogSnapshotLoader).toHaveBeenCalledTimes(1);
    expect(wiring.createSupabaseWatchdogLeaseManager).toHaveBeenCalledTimes(1);
    expect(wiring.createFantasy5GithubDispatcher).toHaveBeenCalledTimes(1);
    expect(wiring.createWatchdogStatusStore).toHaveBeenCalledWith(sdk.db);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:40:05.000Z'));
    try {
      wiring.watchdogRun.mockResolvedValueOnce({
        status: 'ok',
        checkedAt: '2026-09-04T12:39:00.000Z',
        dueLotteries: ['今彩539'],
        actions: [],
      });
      wiring.watchdogStatusSave.mockClear();

      await expect(matrixIndependentWatchdog({
        scheduledTime: '2026-09-04T12:39:00.000Z',
        invocationId: 'cron-invocation-1',
      })).resolves.toEqual({ statusCode: 200 });
      expect(wiring.watchdogRun).toHaveBeenCalledWith(
        new Date('2026-09-04T12:39:00.000Z'),
        'cron-invocation-1',
        { recover: true },
      );
      expect(wiring.watchdogStatusSave).toHaveBeenCalledWith({
        status: 'ok',
        checkedAt: '2026-09-04T12:39:00.000Z',
        completedAt: '2026-09-04T12:40:05.000Z',
        dueLotteries: ['今彩539'],
        actions: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores a safe degraded heartbeat when the watchdog throws', async () => {
    wiring.watchdogRun.mockRejectedValueOnce(new Error('upstream token=server-only-token'));
    wiring.watchdogStatusSave.mockClear();

    await expect(matrixIndependentWatchdog({
      scheduledTime: '2026-09-04T01:39:00.000Z',
      invocationId: 'cron-invocation-2',
    })).resolves.toEqual({ statusCode: 503 });

    expect(wiring.watchdogStatusSave).toHaveBeenCalledWith({
      status: 'degraded',
      checkedAt: '2026-09-04T01:39:00.000Z',
      completedAt: expect.any(String),
      dueLotteries: [],
      actions: [],
      error: 'WATCHDOG_FAILED',
    });
  });

  it('persists completion metadata for a degraded watchdog result with no actions', async () => {
    wiring.watchdogRun.mockResolvedValueOnce({
      status: 'degraded',
      checkedAt: '2026-09-04T01:45:00.000Z',
      dueLotteries: [],
      actions: [],
      error: 'STATUS_UNAVAILABLE',
    });
    wiring.watchdogStatusSave.mockClear();

    await expect(matrixIndependentWatchdog({
      scheduledTime: '2026-09-04T01:45:00.000Z',
      invocationId: 'cron-invocation-degraded',
    })).resolves.toEqual({ statusCode: 503 });

    expect(wiring.watchdogStatusSave).toHaveBeenCalledWith({
      status: 'degraded',
      checkedAt: '2026-09-04T01:45:00.000Z',
      completedAt: expect.any(String),
      dueLotteries: [],
      actions: [],
      error: 'STATUS_UNAVAILABLE',
    });
  });

  it('does not retry a failed heartbeat write and logs one safe degraded result', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:46:05.000Z'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      wiring.watchdogRun.mockResolvedValueOnce({
        status: 'ok',
        checkedAt: '2026-09-04T12:45:00.000Z',
        dueLotteries: ['今彩539'],
        actions: [],
      });
      wiring.watchdogStatusSave.mockClear();
      wiring.watchdogStatusSave.mockRejectedValueOnce(new Error('quota 429 token=server-only-token'));

      await expect(matrixIndependentWatchdog({
        scheduledTime: '2026-09-04T12:45:00.000Z',
        invocationId: 'cron-invocation-3',
      })).resolves.toEqual({ statusCode: 503 });

      expect(wiring.watchdogStatusSave).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('matrix-independent-watchdog ' + JSON.stringify({
        status: 'degraded',
        checkedAt: '2026-09-04T12:45:00.000Z',
        completedAt: '2026-09-04T12:46:05.000Z',
        dueLotteries: ['今彩539'],
        actions: [],
        error: 'WATCHDOG_STATUS_WRITE_FAILED',
      }));
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });

  it('wires current watchdog evidence to read-only snapshots without recovery or heartbeat writes', async () => {
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    wiring.loadWatchdogSnapshot.mockClear(); wiring.watchdogRun.mockClear(); wiring.watchdogStatusSave.mockClear();
    const value = await dependencies.observeWatchdog();
    expect(value).toMatchObject({ checkedAt: expect.any(String), reports: [] });
    expect(wiring.loadWatchdogSnapshot).toHaveBeenCalledWith(expect.any(Date), false);
    expect(wiring.watchdogRun).not.toHaveBeenCalled();
    expect(wiring.watchdogStatusSave).not.toHaveBeenCalled();
  });

  it('injects the typed heartbeat loader into connection status', async () => {
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    await expect(dependencies.loadWatchdogStatus()).resolves.toBeNull();
    expect(wiring.watchdogStatusLoad).toHaveBeenCalled();
  });
});

describe('Supabase watchdog invocation route', () => {
  const route = 'POST /api/internal/matrix-watchdog';
  const execute = async (token?: string) => {
    const ctx = {
      params: {},
      event: { headers: token ? { 'x-matrix-watchdog-token': token } : {} },
    };
    for (const middleware of routes[route] as Array<(input: typeof ctx) => Promise<unknown>>) {
      const result = await middleware(ctx);
      if (result) return result;
    }
  };

  it('exposes one internal route for the Supabase cron', () => {
    expect(routes).toHaveProperty(route);
  });

  it('rejects a missing or invalid cron credential before running the watchdog', async () => {
    wiring.watchdogRun.mockClear();
    wiring.supabaseRequest.mockResolvedValueOnce(false);
    await expect(execute()).resolves.toMatchObject({ status: 401 });
    await expect(execute('wrong-token')).resolves.toMatchObject({ status: 401 });
    expect(wiring.watchdogRun).not.toHaveBeenCalled();
  });

  it('authorizes through the service-role transport and runs with a Supabase owner id', async () => {
    wiring.supabaseRequest.mockResolvedValueOnce(true);
    wiring.watchdogRun.mockResolvedValueOnce({
      status: 'ok', checkedAt: '2026-09-10T16:33:00.000Z', dueLotteries: [], actions: [],
    });
    await expect(execute('cron-secret')).resolves.toMatchObject({ status: 200 });
    expect(wiring.supabaseRequest).toHaveBeenCalledWith(
      'rpc/admin_watchdog_cron_authorize',
      { method: 'POST', body: JSON.stringify({ p_token: 'cron-secret' }) },
    );
    expect(wiring.watchdogRun).toHaveBeenCalledWith(
      expect.any(Date),
      expect.stringMatching(/^supabase-cron:/),
      { recover: true },
    );
  });
});

describe('Supabase Mark Six calendar invocation route', () => {
  const route = 'POST /api/internal/marksix-calendar';
  const execute = async (token = 'cron-secret') => {
    const ctx = {
      body: {},
      params: {},
      event: { headers: { 'x-matrix-watchdog-token': token } },
    };
    for (const middleware of routes[route] as Array<(input: typeof ctx) => Promise<unknown>>) {
      const result = await middleware(ctx);
      if (result) return result;
    }
  };

  it('authenticates and invokes only the calendar refresh adapter', async () => {
    wiring.supabaseRequest.mockResolvedValueOnce(true);
    wiring.workerRefreshMarkSixCalendar.mockClear();
    wiring.workerRunPrimary.mockClear();
    await expect(execute()).resolves.toMatchObject({ status: 200 });
    expect(wiring.workerRefreshMarkSixCalendar).toHaveBeenCalledTimes(1);
    expect(wiring.workerRunPrimary).not.toHaveBeenCalled();
  });
});

describe('Supabase primary scheduler invocation route', () => {
  const route = 'POST /api/internal/matrix-primary';
  const execute = async (body: unknown, token = 'cron-secret') => {
    const ctx = {
      body,
      params: {},
      event: { headers: { 'x-matrix-watchdog-token': token } },
    };
    for (const middleware of routes[route] as Array<(input: typeof ctx) => Promise<unknown>>) {
      const result = await middleware(ctx);
      if (result) return result;
    }
  };

  it('authenticates and forwards only the requested due lotteries', async () => {
    wiring.supabaseRequest.mockResolvedValueOnce(true);
    wiring.workerRunPrimary.mockClear();
    await expect(execute({
      group: 'evening', cycleDate: '2026-09-21', lotteries: ['今彩539', '六合彩'],
    })).resolves.toMatchObject({ status: 200 });
    expect(wiring.workerRunPrimary).toHaveBeenCalledWith(
      'evening', '2026-09-21', ['今彩539', '六合彩'],
    );
  });

  it('rejects a lottery from the other worker group', async () => {
    wiring.supabaseRequest.mockResolvedValueOnce(true);
    wiring.workerRunPrimary.mockClear();
    await expect(execute({
      group: 'fantasy5', cycleDate: '2026-09-21', lotteries: ['今彩539'],
    })).resolves.toMatchObject({ status: 400 });
    expect(wiring.workerRunPrimary).not.toHaveBeenCalled();
  });
});

describe('admin Railway route wiring', () => {
  it('keeps status, retry, and selected crawler refresh routes', () => {
    expect(routes).not.toHaveProperty('GET /api/algorithm-status');
    expect(routes).toHaveProperty('GET /api/system-status');
    expect(routes).toHaveProperty('POST /api/system-status/:id/retry');
    expect(routes).toHaveProperty('POST /api/system-status/:id/refresh');
    expect(routes).not.toHaveProperty('GET /api/admin/worker/status');
  });

  it('loads Railway configuration and passes Worker status into system status', async () => {
    expect(wiring.createWorkerApi).toHaveBeenCalledTimes(1);
    const loadConfig = wiring.createWorkerApi.mock.calls[0][0];
    await expect(loadConfig()).resolves.toMatchObject({ baseUrl: 'https://railway.example', statusToken: 'server-token' });
    expect(wiring.getWorkerConfig).toHaveBeenCalledWith(sdk.secrets);
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    await expect(dependencies.getWorkerStatus()).resolves.toEqual({ ok: false, health: null, jobs: null, reason: 'RAILWAY_UNAVAILABLE' });
  });

  it('checks public query routes on the API host while keeping protected jobs on the recovery host', async () => {
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    await expect(dependencies.loadWorkerUrl()).resolves.toBe('https://public-api.example');
    const loadJobConfig = wiring.createWorkerApi.mock.calls[0][0];
    await expect(loadJobConfig()).resolves.toMatchObject({
      baseUrl: 'https://railway.example',
      statusToken: 'server-token',
    });
  });

  it('injects the server-only GitHub token loader into system status', async () => {
    wiring.getGithubActionsToken.mockClear();
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];

    await expect(dependencies.loadGithubToken()).resolves.toBe('server-only-token');

    expect(wiring.getGithubActionsToken).toHaveBeenCalledWith(sdk.secrets);
  });

  it('uses credential sessions and preserves system-settings view permissions', async () => {
    wiring.requireModulePermission.mockClear();
    for (const route of ['GET /api/system-status', 'POST /api/system-status/:id/retry'] as const) {
      const context = await authenticate(route, sessionContext());
      const permissionGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
      await permissionGuard(context);
    }
    expect(wiring.getAdminFromHeaders).toHaveBeenCalled();
    expect(wiring.requireModulePermission).toHaveBeenNthCalledWith(1, wiring.admin, 'systemSettings', 'view');
    expect(wiring.requireModulePermission).toHaveBeenNthCalledWith(2, wiring.admin, 'systemSettings', 'view');
  });

  it('protects architecture subscriptions with credential and system-settings view guards', async () => {
    const route = 'GET /api/architecture-overview';
    wiring.requirePermission.mockClear();
    wiring.requireModulePermission.mockClear();
    const context = await authenticate(route, sessionContext());
    await (routes[route][1] as (ctx: typeof context) => Promise<unknown>)(context);
    expect(wiring.requireModulePermission).toHaveBeenCalledWith(wiring.admin, 'systemSettings', 'view');
    expect(wiring.requirePermission).toHaveBeenCalledWith(wiring.admin, 'view');
    expect(routes).not.toHaveProperty('PUT /api/architecture-overview');
  });

  it('refreshes exactly the selected crawler and does not audit super-admin activity', async () => {
    wiring.workerRefreshLottery.mockClear();
    wiring.insertRows.mockClear();
    wiring.requirePermission.mockClear();
    const route = 'POST /api/system-status/:id/refresh';
    const context = await authenticate(route, sessionContext({ id: 'cron-matrix-539-refresh-v2' }));
    const permissionGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await permissionGuard(context);
    await expect(routeHandler(context)).resolves.toMatchObject({ body: { refresh: { lottery: '今彩539', status: 'accepted' } } });
    expect(wiring.requirePermission).toHaveBeenCalledWith(wiring.admin, 'edit');
    expect(wiring.workerRefreshLottery).toHaveBeenCalledWith('今彩539');
    expect(wiring.insertRows).not.toHaveBeenCalled();
  });

  it('protects correlated refresh status with session and edit permissions', async () => {
    const route = 'GET /api/system-status/:id/refresh/:requestId';
    const requestId = '11111111-1111-4111-8111-111111111111';
    const context = await authenticate(route, sessionContext({ id: 'cron-matrix-fantasy5-refresh-v2', requestId }));
    await (routes[route][1] as any)(context);
    await (routes[route][2] as any)(context);
    expect(wiring.requireModulePermission).toHaveBeenLastCalledWith(wiring.admin, 'systemSettings', 'edit');
    expect(wiring.workerRefreshLottery).toHaveBeenLastCalledWith('天天樂', requestId);
    wiring.workerRefreshLottery.mockClear();
    const invalid = await authenticate(route, sessionContext({ id: 'cron-matrix-fantasy5-refresh-v2', requestId: 'bad-id' }));
    expect(await (routes[route][2] as any)(invalid)).toMatchObject({status: 400});
    expect(wiring.workerRefreshLottery).not.toHaveBeenCalled();
  });

  it('rejects non-crawler status items without calling Railway refresh', async () => {
    wiring.workerRefreshLottery.mockClear();
    const route = 'POST /api/system-status/:id/refresh';
    const context = await authenticate(route, sessionContext({ id: 'railway-health' }));
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await expect(routeHandler(context)).resolves.toEqual({ error: '此項目不支援資料更新', status: 400 });
    expect(wiring.workerRefreshLottery).not.toHaveBeenCalled();
  });
});

describe('administrator revision route forwarding', () => {
  it.each([undefined, '0'])('rejects missing or string revision %s without reading or writing accounts', async expectedRevision => {
    const transport = wiring.createSupabaseTransport.mock.results[0].value;
    transport.selectRows.mockClear();
    transport.updateRows.mockClear();
    const route = 'PUT /api/admins/:id';
    const context = await authenticate(route, sessionContext({ id: 'operator' }));
    const handler = routes[route][2] as (ctx: typeof context & { body: unknown }) => Promise<unknown>;
    await expect(handler({ ...context, body: { expectedRevision } })).resolves.toMatchObject({ status: 409 });
    expect(transport.selectRows).not.toHaveBeenCalled();
    expect(transport.updateRows).not.toHaveBeenCalled();
  });

  it('passes the exact numeric revision through to the conditional account write', async () => {
    const transport = wiring.createSupabaseTransport.mock.results[0].value;
    const row = { id: 'operator', account: 'operator', name: 'Operator', role: '查看人員', status: '啟用', revision: 7 };
    transport.selectRows.mockResolvedValueOnce([row] as never[]);
    transport.updateRows.mockResolvedValueOnce([{ ...row, revision: 8 }] as never[]);
    const route = 'PUT /api/admins/:id';
    const context = await authenticate(route, sessionContext({ id: 'operator' }));
    const handler = routes[route][2] as (ctx: typeof context & { body: unknown }) => Promise<unknown>;
    await expect(handler({ ...context, body: { ...row, expectedRevision: 7, permissions: {} } })).resolves.toMatchObject({ status: 200 });
    expect(transport.updateRows).toHaveBeenLastCalledWith('admin_accounts', 'id=eq.operator&revision=eq.7', expect.any(Object));
  });
});

describe('admin push notification route wiring', () => {
  it('protects the exact routes with credential sessions and global permissions', async () => {
    wiring.requirePermission.mockClear();
    const expected = [
      ['GET /api/push-members', 'view'],
      ['POST /api/push-members/:id/test', 'edit'],
      ['GET /api/push-delivery-logs', 'view'],
    ] as const;
    for (const [route, permission] of expected) {
      expect(routes[route]).toHaveLength(3);
      const context = await authenticate(route, sessionContext({ id: '11111111-1111-4111-8111-111111111111' }));
      const permissionGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
      await permissionGuard(context);
      expect(wiring.requirePermission).toHaveBeenLastCalledWith(wiring.admin, permission);
    }
  });

  it('uses the route member and credential-session administrator account only', async () => {
    wiring.sendMemberTestPush.mockClear();
    const route = 'POST /api/push-members/:id/test';
    const context = await authenticate(route, sessionContext({ id: '11111111-1111-4111-8111-111111111111' }));
    const routeHandler = routes[route][2] as (input: typeof context & { body?: unknown }) => Promise<unknown>;
    await routeHandler({ ...context, body: { adminAccount: 'attacker@example.com', userId: 'member-2', requestId: '33333333-3333-4333-8333-333333333333' } });
    expect(wiring.sendMemberTestPush).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'admin@example.com', '33333333-3333-4333-8333-333333333333', wiring.admin.id);
  });

  it('returns safe push validation and business errors', async () => {
    const route = 'POST /api/push-members/:id/test';
    let context = await authenticate(route, sessionContext({ id: 'member-1' }));
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await expect(routeHandler(context)).resolves.toEqual({ error: 'INVALID_MEMBER_ID', status: 400 });
    for (const [statusCode, message] of [[400, 'INVALID_REQUEST'], [409, 'NO_ACTIVE_SUBSCRIPTIONS']] as const) {
      wiring.sendMemberTestPush.mockRejectedValueOnce(Object.assign(new Error(message), { statusCode }));
      context = await authenticate(route, sessionContext({ id: '11111111-1111-4111-8111-111111111111' }));
      await expect(routeHandler({ ...context, body: { requestId: '33333333-3333-4333-8333-333333333333' } })).resolves.toEqual({ error: message, status: statusCode });
    }
  });

  it('forwards bounded member search and pagination without changing permissions', async () => {
    const route = 'GET /api/push-members';
    const context = await authenticate(route, sessionContext());
    const query = { page: '4', keyword: 'Google 會員', userId: '11111111-1111-4111-8111-111111111111' };
    const handler = routes[route][2] as (input: typeof context & { query: typeof query }) => Promise<unknown>;
    await expect(handler({ ...context, query })).resolves.toMatchObject({ body: { total: 1, currentPage: 1, totalPages: 1 } });
    expect(wiring.listMemberPushStatus).toHaveBeenLastCalledWith(query);
  });

  it('routes list requests to member and delivery-log APIs', async () => {
    for (const [route, expected] of [
      ['GET /api/push-members', { items: [{ userId: 'member-1' }] }],
      ['GET /api/push-delivery-logs', { items: [{ id: 'log-1' }] }],
    ] as const) {
      const context = await authenticate(route, sessionContext());
      const handler = routes[route][2] as (input: typeof context) => Promise<unknown>;
      await expect(handler(context)).resolves.toMatchObject({ body: expected });
    }
  });
});

describe('admin todo route wiring', () => {
  it('protects all four todo routes with credential sessions only', () => {
    for (const route of [
      'GET /api/todos',
      'POST /api/todos',
      'PUT /api/todos/:id',
      'DELETE /api/todos/:id',
    ]) {
      expect(routes[route]).toHaveLength(2);
    }
  });

  it('lists todos from the dedicated service', async () => {
    const route = 'GET /api/todos';
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][1] as (input: typeof context) => Promise<unknown>;

    await expect(routeHandler(context)).resolves.toMatchObject({
      body: { items: [{ id: 'todo-1', content: '待處理' }] },
    });
  });

  it('creates a todo with the credential-session actor and ignores forged identity fields', async () => {
    wiring.todoCreate.mockClear();
    const route = 'POST /api/todos';
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][1] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(routeHandler({
      ...context,
      body: { content: '新事項', adminId: 'attacker', role: '超級管理員' },
    })).resolves.toMatchObject({ status: 201, body: { item: { id: 'todo-2' } } });
    expect(wiring.todoCreate).toHaveBeenCalledWith('新事項', {
      id: wiring.admin.id,
      account: wiring.admin.account,
      name: wiring.admin.name,
      role: wiring.admin.role,
    });
  });

  it('updates and deletes by route id while keeping role and ownership server-owned', async () => {
    wiring.todoUpdate.mockClear();
    wiring.todoRemove.mockClear();

    const updateRoute = 'PUT /api/todos/:id';
    const updateContext = await authenticate(updateRoute, sessionContext({ id: 'todo-1' }));
    const updateHandler = routes[updateRoute][1] as (input: typeof updateContext & { body?: unknown }) => Promise<unknown>;
    await updateHandler({ ...updateContext, body: { content: '已更新', expectedRevision: 0, adminId: 'attacker' } });

    const deleteRoute = 'DELETE /api/todos/:id';
    const deleteContext = await authenticate(deleteRoute, sessionContext({ id: 'todo-1' }));
    const deleteHandler = routes[deleteRoute][1] as (input: typeof deleteContext) => Promise<unknown>;
    await deleteHandler(deleteContext);

    const actor = {
      id: wiring.admin.id,
      account: wiring.admin.account,
      name: wiring.admin.name,
      role: wiring.admin.role,
    };
    expect(wiring.todoUpdate).toHaveBeenCalledWith('todo-1', '已更新', actor, 0);
    expect(wiring.todoRemove).toHaveBeenCalledWith('todo-1', actor);
  });

  it('maps todo service errors without exposing a raw exception', async () => {
    wiring.todoUpdate.mockRejectedValueOnce(Object.assign(new Error('只能編輯自己的代辦事項'), { statusCode: 403 }));
    const route = 'PUT /api/todos/:id';
    const context = await authenticate(route, sessionContext({ id: 'todo-1' }));
    const routeHandler = routes[route][1] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(routeHandler({ ...context, body: { content: '越權', expectedRevision: 0 } })).resolves.toEqual({
      error: '只能編輯自己的代辦事項',
      status: 403,
    });
  });
});

describe('admin formal system notification route wiring', () => {
  it('loads the notification ingest configuration from server-only Edge secrets', async () => {
    expect(wiring.createNotificationEvents).toHaveBeenCalledTimes(1);
    const loadConfig = wiring.createNotificationEvents.mock.calls[0][0];
    await expect(loadConfig()).resolves.toEqual({
      supabaseUrl: 'https://supabase.example',
      ingestToken: 'server-only-ingest-token',
    });
    expect(wiring.getNotificationEventConfig).toHaveBeenCalledWith(sdk.secrets);
  });

  it('protects POST /api/system-notices with credential session and global edit permission', async () => {
    wiring.requirePermission.mockClear();
    const route = 'POST /api/system-notices';
    expect(routes[route]).toHaveLength(3);
    const context = await authenticate(route, sessionContext());
    const permissionGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
    await permissionGuard(context);
    expect(wiring.requirePermission).toHaveBeenCalledWith(wiring.admin, 'edit');
  });

  it('creates a formal system notice and does not audit super-admin activity', async () => {
    wiring.sendSystemNotice.mockClear();
    wiring.insertRows.mockClear();
    wiring.shouldRecordAdminActivity.mockReturnValue(false);
    const route = 'POST /api/system-notices';
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][2] as (input: typeof context & { body?: unknown }) => Promise<unknown>;
    await expect(routeHandler({
      ...context,
      body: { category: '更新', title: '系統更新', body: '新功能已上線。' },
    })).resolves.toEqual({ body: { notice: wiring.notice }, status: 201, headers: {} });
    expect(wiring.sendSystemNotice).toHaveBeenCalledWith({
      category: '更新', title: '系統更新', body: '新功能已上線。',
    });
    expect(wiring.insertRows).not.toHaveBeenCalled();
  });

  it('keeps an accepted notice successful when audit storage fails', async () => {
    wiring.sendSystemNotice.mockClear();
    wiring.insertRows.mockReset();
    wiring.insertRows.mockRejectedValueOnce(new Error('audit unavailable'));
    wiring.shouldRecordAdminActivity.mockReturnValueOnce(true);
    const route = 'POST /api/system-notices';
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][2] as (input: typeof context & { body?: unknown }) => Promise<unknown>;
    await expect(routeHandler({
      ...context,
      body: { category: '更新', title: '系統更新', body: '新功能已上線。' },
    })).resolves.toEqual({ body: { notice: wiring.notice }, status: 201, headers: {} });
    expect(wiring.insertRows).toHaveBeenCalledWith('audit_logs', [expect.objectContaining({
      admin_id: 'admin-1',
      admin: '管理員',
      operation_type: '發送系統通知',
      target_table: 'notification_events',
      target_id: wiring.notice.eventKey,
      content: '更新：系統更新',
      before_data: null,
      after_data: wiring.notice,
      ip: '127.0.0.1',
      device: 'test-agent',
    })]);
    wiring.insertRows.mockImplementation(async () => []);
    wiring.shouldRecordAdminActivity.mockReturnValue(false);
  });
});

describe('admin revenue reset route wiring', () => {
  it('enforces super-admin role from credential session', async () => {
    const operator = { ...wiring.admin, role: '營運管理員' };
    wiring.getAdminFromHeaders.mockResolvedValueOnce(operator);
    const route = 'POST /api/revenue/reset';
    const context = await authenticate(route, sessionContext());
    const guard = routes[route][1] as (input: typeof context) => Promise<unknown>;
    await expect(guard(context)).resolves.toEqual({ error: '僅超級管理員可重設收入', status: 403 });
  });

  it('stores a new reset baseline after an authenticated super-admin request', async () => {
    wiring.supabaseRequest.mockResolvedValueOnce([{ id: 1, reset_at: '2026-09-02T06:45:00.000Z' }]);
    const route = 'POST /api/revenue/reset';
    const context = await authenticate(route, {
      ...sessionContext(), body: { requestId: '00000000-0000-4000-8000-000000000123' },
    });
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await expect(routeHandler(context)).resolves.toMatchObject({ body: { resetAt: expect.any(String) }, status: 200 });
    expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/admin_reset_revenue_baseline_v2', expect.objectContaining({
      method: 'POST', body: expect.stringContaining('"p_request_id":"00000000-0000-4000-8000-000000000123"'),
    }));
  });

  it('rejects a reset without a client request identity before advancing the baseline', async () => {
    wiring.supabaseRequest.mockClear();
    const route = 'POST /api/revenue/reset';
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await expect(routeHandler(context)).resolves.toMatchObject({ status: 400 });
    expect(wiring.supabaseRequest).not.toHaveBeenCalled();
  });
});

describe('admin core mutation operation permissions', () => {
  const mutationRoutes = [
    ['PUT /api/members/:id/status', 'users', 'edit'],
    ['PUT /api/subscriptions/:id', 'subscriptions', 'edit'],
    ['PUT /api/transfer-requests/:id', 'subscriptions', 'edit'],
    ['PUT /api/payments/:id/reversal', 'subscriptions', 'edit'],
    ['POST /api/activation-codes/batch', 'activationCodes', 'add'],
    ['DELETE /api/activation-codes/:id', 'activationCodes', 'delete'],
  ] as const;

  it('requires both module edit access and the matching stored operation permission', async () => {
    wiring.requireModulePermission.mockClear();
    wiring.requirePermission.mockClear();

    for (const [route, module, permission] of mutationRoutes) {
      const context = await authenticate(route, sessionContext({ id: 'record-1' }));
      const operationGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
      await expect(operationGuard(context)).resolves.toBeUndefined();
      expect(wiring.requireModulePermission).toHaveBeenLastCalledWith(wiring.admin, module, 'edit');
      expect(wiring.requirePermission).toHaveBeenLastCalledWith(wiring.admin, permission);
    }
  });

  it('denies every core mutation when its stored operation permission is disabled', async () => {
    for (const [route] of mutationRoutes) {
      wiring.requirePermission.mockReset();
      wiring.requirePermission.mockImplementationOnce(() => {
        throw Object.assign(new Error('權限不足'), { statusCode: 403 });
      });
      const context = await authenticate(route, sessionContext({ id: 'record-1' }));
      const operationGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
      const result = await operationGuard(context);
      wiring.requirePermission.mockReset();
      expect(result).toEqual({ error: '權限不足', status: 403 });
    }
  });
});

describe('payment reversal route wiring', () => {
  it('rejects an operations administrator even with subscription editing permission', async () => {
    const route = 'PUT /api/payments/:id/reversal';
    const context = await authenticate(route, sessionContext({ id: 'payment-1' }));
    const roleGuard = routes[route][2] as (input: typeof context) => Promise<unknown>;
    wiring.admin.role = '營運管理員';
    wiring.supabaseRequest.mockClear();
    try {
      await expect(roleGuard(context)).resolves.toMatchObject({ status: 403 });
      expect(wiring.supabaseRequest).not.toHaveBeenCalled();
      wiring.admin.role = '超級管理員';
      await expect(roleGuard(context)).resolves.toBeUndefined();
    } finally {
      wiring.admin.role = '超級管理員';
    }
  });

  it('uses only reversal fields from the body and the authenticated session actor', async () => {
    wiring.supabaseRequest.mockClear();
    wiring.supabaseRequest.mockResolvedValueOnce({ id: 'payment-1', status: 'chargeback' });
    const route = 'PUT /api/payments/:id/reversal';
    const context = await authenticate(route, sessionContext({ id: 'payment-1' }));
    const routeHandler = routes[route][3] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(routeHandler({
      ...context,
      body: {
        status: 'chargeback',
        reason: '收單行刷退完成',
        actorId: 'attacker',
        actorName: '偽造管理員',
      },
    })).resolves.toMatchObject({ body: { id: 'payment-1', status: 'chargeback' } });
    expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/admin_record_payment_reversal', {
      method: 'POST',
      body: JSON.stringify({
        p_payment_id: 'payment-1',
        p_status: 'chargeback',
        p_reason: '收單行刷退完成',
        p_actor_id: wiring.admin.id,
        p_actor_name: wiring.admin.name,
      }),
    });
  });

  it('forwards member list filters after enforcing module view permission', async () => {
    wiring.requestPage.mockClear();
    wiring.requireModulePermission.mockClear();
    const route = 'GET /api/data/:table';
    const context = await authenticate(route, sessionContext({ table: 'users' }));
    const routeHandler = routes[route][2] as (input: typeof context & { query: Record<string, string> }) => Promise<unknown>;
    await expect(routeHandler({ ...context, query: { page: '2', status: 'disabled' } })).resolves.toMatchObject({ body: { total: 61, currentPage: 2, totalPages: 5 } });
    expect(wiring.requireModulePermission).toHaveBeenCalledWith(wiring.admin, 'users', 'view');
    const query = new URL(wiring.requestPage.mock.calls[0][0], 'https://example.test').searchParams;
    expect(query.get('limit')).toBe('15');
    expect(query.get('offset')).toBe('15');
    expect(query.get('status')).toBe('in.(disabled,inactive,停用)');

    wiring.requestPage.mockClear();
    wiring.requireModulePermission.mockImplementationOnce(() => { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }); });
    await expect(routeHandler({ ...context, query: { page: '1' } })).resolves.toMatchObject({ status: 403 });
    expect(wiring.requestPage).not.toHaveBeenCalled();
  });

  it.each([
    ['activationCodes', 'activationCodes', 'createdAt', 'created_at', '10'],
    ['auditLogs', null, 'operationTime', 'operation_time', '30'],
    ['subscriptionRecords', 'subscriptions', 'paidAt', 'paid_at', '30'],
    ['transferRequests', 'subscriptions', 'submittedAt', 'submitted_at', '30'],
    ['admins', 'admins', 'createdAt', 'created_at', '30'],
    ['plans', 'subscriptions', 'price', 'price', '30'],
  ])('routes %s through database pagination and sorting after existing authorization', async (table, module, sortBy, column, limit) => {
    wiring.requestPage.mockClear();
    wiring.requireModulePermission.mockClear();
    const route = 'GET /api/data/:table';
    const context = await authenticate(route, sessionContext({ table }));
    const routeHandler = routes[route][2] as (input: typeof context & { query: Record<string, string> }) => Promise<unknown>;
    await expect(routeHandler({ ...context, query: { page: '2', sortBy: sortBy!, sortDirection: 'asc' } }))
      .resolves.toMatchObject({ body: { total: 61, currentPage: 2 } });
    const query = new URL(wiring.requestPage.mock.calls[0][0], 'https://example.test').searchParams;
    expect(query.get('limit')).toBe(limit);
    expect(query.get('offset')).toBe(limit);
    expect(query.get('order')).toBe(`${column}.asc.nullslast,id.asc`);
    if (module) expect(wiring.requireModulePermission).toHaveBeenCalledWith(wiring.admin, module, 'view');
  });

  it('maps subscriptionRecords reads to subscription view permission', async () => {
    wiring.requireModulePermission.mockClear();
    const route = 'GET /api/data/:table';
    const context = await authenticate(route, sessionContext({ table: 'subscriptionRecords' }));
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;

    await routeHandler(context);
    expect(wiring.requireModulePermission).toHaveBeenCalledWith(wiring.admin, 'subscriptions', 'view');
  });

  it('rejects non-string reversal fields instead of coercing attacker-controlled values', async () => {
    wiring.supabaseRequest.mockClear();
    const route = 'PUT /api/payments/:id/reversal';
    const context = await authenticate(route, sessionContext({ id: 'payment-1' }));
    const routeHandler = routes[route][3] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(routeHandler({
      ...context,
      body: { status: 'refunded', reason: { value: '偽造理由' } },
    })).resolves.toMatchObject({ status: 400 });
    expect(wiring.supabaseRequest).not.toHaveBeenCalled();
  });
});



describe('security login wiring', () => {
  it.each(['observation', 'last_login', 'login_record'] as const)(
    'revokes the newly created session without setting a cookie when %s fails', async (stage) => {
      const auth = wiring.createAdminCredentialAuth.mock.results[0].value;
      auth.login.mockResolvedValueOnce({ admin: wiring.admin, token: 'one-time-token', loginRecordId: 'login-record-id' });
      auth.revokeLogin.mockClear();
      wiring.insertRows.mockClear();
      wiring.shouldRecordAdminActivity.mockReturnValueOnce(true);
      if (stage === 'observation') securityWiring.observe.mockRejectedValueOnce(new Error('observation unavailable'));
      if (stage === 'last_login') wiring.updateRows.mockRejectedValueOnce(new Error('update unavailable'));
      if (stage === 'login_record') wiring.insertRows.mockRejectedValueOnce(new Error('insert unavailable'));

      const handler = routes['POST /api/admin-login'][0] as (ctx: unknown) => Promise<unknown>;
      const result = await handler({ params: {}, body: { account: 'operator', password: 'test-password' }, event: { headers: {} } });

      expect(result).toMatchObject({ status: 403 });
      expect(JSON.stringify(result)).not.toContain('one-time-token');
      expect(auth.revokeLogin).toHaveBeenCalledExactlyOnceWith('one-time-token');
      if (stage !== 'login_record') expect(wiring.insertRows).not.toHaveBeenCalled();
    },
  );
  it.each(['203.0.113.7', ''])('persists verified location IP "%s" without falling back to proxy headers', async (clientIp) => {
    const auth = wiring.createAdminCredentialAuth.mock.results[0].value;
    const login = auth.login;
    login.mockResolvedValueOnce({ admin: wiring.admin, token: 'test-session', loginRecordId: 'login-ip-test' });
    auth.revokeLogin.mockClear();
    wiring.shouldRecordAdminActivity.mockReturnValueOnce(true);
    wiring.insertRows.mockClear();
    const handler = routes['POST /api/admin-login'][0] as (ctx: unknown) => Promise<unknown>;
    const response = await handler({
      params: {}, body: { account: 'operator', password: 'test-password' },
      event: {
        clientIp,
        headers: { 'user-agent': 'test-device', 'x-forwarded-for': '2a06:98c0:3600::103, 13.248.115.52' },
        requestContext: { http: { sourceIp: '13.248.115.52' } },
      },
    });
    expect(response).toMatchObject({ status: 200 });
    expect(auth.revokeLogin).not.toHaveBeenCalled();
    expect(wiring.insertRows).toHaveBeenCalledWith('admin_login_records', [expect.objectContaining({
      id: 'login-ip-test', ip: clientIp, device: 'test-device',
    })]);
  });

  it('returns 429 before password verification', async () => {
    const login = wiring.createAdminCredentialAuth.mock.results[0].value.login;
    login.mockClear();
    securityWiring.check.mockResolvedValueOnce({allowed:false,retryAfter:23,mode:'enforce'});
    const handler = routes['POST /api/admin-login'][0] as (ctx:unknown) => Promise<unknown>;
    expect(await handler({params:{},body:{account:'admin',password:'secret'}})).toMatchObject({status:429,headers:{'Retry-After':'23'}});
    expect(login).not.toHaveBeenCalled();
  });
  it('records failed credentials outside superadmin activity exemption without forwarding body', async () => {
    const login = wiring.createAdminCredentialAuth.mock.results[0].value.login;
    login.mockRejectedValueOnce(Object.assign(new Error('Invalid credentials'), {statusCode:401}));
    securityWiring.observe.mockClear();
    const handler = routes['POST /api/admin-login'][0] as (ctx:unknown) => Promise<unknown>;
    const context={params:{},body:{account:'admin',password:'secret'}};
    expect(await handler(context)).toMatchObject({status:401});
    expect(securityWiring.observe).toHaveBeenCalledWith(context,'admin_login','denied');
  });
});

describe('Matrix permission settings routes', () => {
  const settings = {
    subscriptionPurchaseVisible: false,
    registeredMemberFreeAccess: true,
    revision: 4,
    updatedAt: '2026-09-10T22:00:00.000Z',
  };

  it('allows every authenticated administrator to read the canonical settings', async () => {
    wiring.supabaseRequest.mockClear();
    wiring.supabaseRequest.mockResolvedValueOnce(settings);
    const route = 'GET /api/permission-settings';
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][1] as (input: typeof context) => Promise<unknown>;

    await expect(routeHandler(context)).resolves.toMatchObject({ body: settings, status: 200 });
    expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/matrix_permission_settings', {
      method: 'POST',
      body: '{}',
    });
  });

  it('uses the authenticated super administrator as the only update actor', async () => {
    wiring.supabaseRequest.mockClear();
    wiring.supabaseRequest.mockResolvedValueOnce({ ...settings, subscriptionPurchaseVisible: true, revision: 5 });
    const route = 'PUT /api/permission-settings/:key';
    const context = await authenticate(route, sessionContext({ key: 'subscriptionPurchaseVisible' }));
    const superGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
    const routeHandler = routes[route][2] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(superGuard(context)).resolves.toBeUndefined();
    await expect(routeHandler({
      ...context,
      body: { value: true, expectedRevision: 4 },
    })).resolves.toMatchObject({ body: { subscriptionPurchaseVisible: true, revision: 5 } });
    expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/admin_matrix_permission_settings_update', {
      method: 'POST',
      body: JSON.stringify({
        p_admin_id: wiring.admin.id,
        p_change: { key: 'subscriptionPurchaseVisible', value: true, expectedRevision: 4 },
      }),
    });
  });

  it('rejects a non-super administrator before any database update', async () => {
    wiring.supabaseRequest.mockClear();
    const originalRole = wiring.admin.role;
    wiring.admin.role = '營運管理員';
    try {
      const route = 'PUT /api/permission-settings/:key';
      const context = await authenticate(route, sessionContext({ key: 'registeredMemberFreeAccess' }));
      const superGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
      await expect(superGuard(context)).resolves.toEqual({ error: '僅超級管理員可修改權限切換', status: 403 });
      expect(wiring.supabaseRequest).not.toHaveBeenCalled();
    } finally {
      wiring.admin.role = originalRole;
    }
  });

  it.each([
    [{ key: 'unknown' }, { value: true, expectedRevision: 4 }],
    [{ key: 'subscriptionPurchaseVisible' }, { value: 'true', expectedRevision: 4 }],
    [{ key: 'subscriptionPurchaseVisible' }, { value: true, expectedRevision: -1 }],
    [{ key: 'subscriptionPurchaseVisible' }, { value: true, expectedRevision: 4, actorId: 'attacker' }],
  ])('rejects invalid or actor-injecting update input', async (params, body) => {
    wiring.supabaseRequest.mockClear();
    const route = 'PUT /api/permission-settings/:key';
    const context = await authenticate(route, sessionContext(params));
    const routeHandler = routes[route][2] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(routeHandler({ ...context, body })).resolves.toMatchObject({ status: 400 });
    expect(wiring.supabaseRequest).not.toHaveBeenCalled();
  });
});

describe('security policy administration wiring', () => {
  it('uses authenticated admin identity and validates all policy fields', async () => {
    const route='PUT /api/security-policies/:category';
    const context=await authenticate(route,sessionContext({category:'public_query'}));
    const handler=routes[route][2] as (ctx:unknown)=>Promise<unknown>;
    wiring.supabaseRequest.mockClear();
    await handler({...context,body:{mode:'observe',threshold:120,windowSeconds:60,expectedRevision:1,adminId:'forged'}});
    expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/security_policy_update',{method:'POST',body:JSON.stringify({p_admin_id:wiring.admin.id,p_category:'public_query',p_mode:'observe',p_threshold:120,p_window_seconds:60,p_expected_revision:1})});
    wiring.supabaseRequest.mockClear();
    expect(await handler({...context,body:{mode:'enforce',threshold:0,windowSeconds:60,expectedRevision:1}})).toMatchObject({status:400});
    expect(wiring.supabaseRequest).not.toHaveBeenCalled();
  });
});

it('optimizer invocation cannot trigger recovery or replace the watchdog heartbeat',async()=>{
 wiring.watchdogRun.mockClear();wiring.watchdogStatusSave.mockClear();
 wiring.supabaseRequest.mockResolvedValueOnce({acquired:false} as never);
 await expect(matrixIndependentWatchdog({optimizer:true,optimizerScope:'railway'})).resolves.toEqual({statusCode:200});
 expect(wiring.watchdogRun).not.toHaveBeenCalled();expect(wiring.watchdogStatusSave).not.toHaveBeenCalled();
});
it('history reads require a session and system settings permission',async()=>{
 const history=routes['GET /api/system-status/optimizer-history'];
 expect(history).toHaveLength(3);
 const response=await (history[2] as Function)({params:{},query:{scope:'anything'}});
 expect(response).toEqual({error:'OPTIMIZER_QUERY_INVALID',status:400});
});
