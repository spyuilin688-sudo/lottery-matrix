import { describe, expect, it, vi } from 'vitest';

const wiring = vi.hoisted(() => {
  const workerStatus = { ok: false, health: null, jobs: null, reason: 'RAILWAY_UNAVAILABLE' } as const;
  const workerGetStatus = vi.fn(async () => workerStatus);
  const workerRefreshLottery = vi.fn(async (lottery: string) => ({ lottery, period: '115000211', drawDate: '2026-09-01' }));
  const workerRecoverLottery = vi.fn(async (lottery: string) => ({ lottery, status: 'accepted' }));
  const getWorkerConfig = vi.fn(async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }));
  const createWorkerApi = vi.fn(() => ({
    getStatus: workerGetStatus,
    refreshLottery: workerRefreshLottery,
    recoverLottery: workerRecoverLottery,
  }));
  const insertRows = vi.fn(async () => []);
  const supabaseRequest = vi.fn(async () => []);
  const createSupabaseTransport = vi.fn(() => ({
    selectRows: vi.fn(async () => []), insertRows, updateRows: vi.fn(async () => []), deleteRows: vi.fn(async () => []), supabaseRequest,
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
    logout: vi.fn(),
    sessionCookie: vi.fn(() => 'admin_session=test; HttpOnly'),
    clearSessionCookie: vi.fn(() => 'admin_session=; Max-Age=0'),
    isConfigured: vi.fn(async () => false),
    setPassword: vi.fn(async () => undefined),
    passwordFields: vi.fn(async () => ({ password_salt: 'salt', password_hash: 'hash' })),
  }));
  const listMemberPushStatus = vi.fn(async () => [{ userId: 'member-1' }]);
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
  const watchdogRun = vi.fn(async () => ({ status: 'ok', checkedAt: '2026-09-04T01:33:00.000Z', actions: [] }));
  const createIndependentWatchdog = vi.fn(() => ({ run: watchdogRun }));
  const loadWatchdogSnapshot = vi.fn(async () => []);
  const createSupabaseWatchdogSnapshotLoader = vi.fn(() => loadWatchdogSnapshot);
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
    workerGetStatus, workerRefreshLottery, workerRecoverLottery, getWorkerConfig, createWorkerApi, insertRows, supabaseRequest,
    createSupabaseTransport, createConnectionStatus, admin, requireAdmin, requirePermission, requireModulePermission,
    shouldRecordAdminActivity, getAdminFromHeaders, createAdminCredentialAuth, listMemberPushStatus,
    sendMemberTestPush, listPushDeliveryLogs, createPushNotifications,
    todoList, todoCreate, todoUpdate, todoRemove, createAdminTodos,
    notice, sendSystemNotice, getNotificationEventConfig, createNotificationEvents,
    watchdogRun, createIndependentWatchdog, loadWatchdogSnapshot,
    createSupabaseWatchdogSnapshotLoader, dispatchFantasy5,
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
  };
});

vi.mock('@appdeploy/sdk', () => sdk);
vi.mock('./worker-api', () => ({ createWorkerApi: wiring.createWorkerApi, getWorkerConfig: wiring.getWorkerConfig }));
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
  createFantasy5GithubDispatcher: wiring.createFantasy5GithubDispatcher,
  getGithubActionsToken: wiring.getGithubActionsToken,
}));

import { handler, matrixIndependentWatchdog } from './index';
const routes = handler as unknown as Record<string, unknown[]>;
const sessionContext = (params: Record<string, string> = {}) => ({
  params,
  event: { headers: { cookie: 'admin_session=test', 'user-agent': 'test-agent' }, requestContext: { http: { sourceIp: '127.0.0.1' } } },
});

async function authenticate(route: string, context: ReturnType<typeof sessionContext>) {
  const middleware = routes[route][0] as (input: typeof context) => Promise<unknown>;
  await middleware(context);
  return context as typeof context & { admin: typeof wiring.admin };
}

describe('independent watchdog cron wiring', () => {
  it('exports a cron handler that always completes with HTTP 200', async () => {
    expect(wiring.createIndependentWatchdog).toHaveBeenCalledTimes(1);
    expect(wiring.createSupabaseWatchdogSnapshotLoader).toHaveBeenCalledTimes(1);
    expect(wiring.createFantasy5GithubDispatcher).toHaveBeenCalledTimes(1);

    await expect(matrixIndependentWatchdog({
      scheduledTime: '2026-09-04T01:33:00.000Z',
    })).resolves.toEqual({ statusCode: 200 });
    expect(wiring.watchdogRun).toHaveBeenCalledWith(
      new Date('2026-09-04T01:33:00.000Z'),
    );
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

  it('refreshes exactly the selected crawler and does not audit super-admin activity', async () => {
    wiring.workerRefreshLottery.mockClear();
    wiring.insertRows.mockClear();
    wiring.requirePermission.mockClear();
    const route = 'POST /api/system-status/:id/refresh';
    const context = await authenticate(route, sessionContext({ id: 'cron-matrix-539-refresh-v2' }));
    const permissionGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await permissionGuard(context);
    await expect(routeHandler(context)).resolves.toMatchObject({ body: { refresh: { lottery: '今彩539', period: '115000211' } } });
    expect(wiring.requirePermission).toHaveBeenCalledWith(wiring.admin, 'edit');
    expect(wiring.workerRefreshLottery).toHaveBeenCalledWith('今彩539');
    expect(wiring.insertRows).not.toHaveBeenCalled();
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
    await routeHandler({ ...context, body: { adminAccount: 'attacker@example.com', userId: 'member-2' } });
    expect(wiring.sendMemberTestPush).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'admin@example.com');
  });

  it('returns safe push validation and business errors', async () => {
    const route = 'POST /api/push-members/:id/test';
    let context = await authenticate(route, sessionContext({ id: 'member-1' }));
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await expect(routeHandler(context)).resolves.toEqual({ error: 'INVALID_MEMBER_ID', status: 400 });
    for (const [statusCode, message] of [[400, 'INVALID_REQUEST'], [409, 'NO_ACTIVE_SUBSCRIPTIONS']] as const) {
      wiring.sendMemberTestPush.mockRejectedValueOnce(Object.assign(new Error(message), { statusCode }));
      context = await authenticate(route, sessionContext({ id: '11111111-1111-4111-8111-111111111111' }));
      await expect(routeHandler(context)).resolves.toEqual({ error: message, status: statusCode });
    }
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
    await updateHandler({ ...updateContext, body: { content: '已更新', adminId: 'attacker' } });

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
    expect(wiring.todoUpdate).toHaveBeenCalledWith('todo-1', '已更新', actor);
    expect(wiring.todoRemove).toHaveBeenCalledWith('todo-1', actor);
  });

  it('maps todo service errors without exposing a raw exception', async () => {
    wiring.todoUpdate.mockRejectedValueOnce(Object.assign(new Error('只能編輯自己的代辦事項'), { statusCode: 403 }));
    const route = 'PUT /api/todos/:id';
    const context = await authenticate(route, sessionContext({ id: 'todo-1' }));
    const routeHandler = routes[route][1] as (input: typeof context & { body?: unknown }) => Promise<unknown>;

    await expect(routeHandler({ ...context, body: { content: '越權' } })).resolves.toEqual({
      error: '只能編輯自己的代辦事項',
      status: 403,
    });
  });
});

describe('admin formal system notification route wiring', () => {
  it('loads the notification ingest configuration only from AppDeploy secrets', async () => {
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
    const context = await authenticate(route, sessionContext());
    const routeHandler = routes[route][2] as (input: typeof context) => Promise<unknown>;
    await expect(routeHandler(context)).resolves.toMatchObject({ body: { resetAt: expect.any(String) }, status: 200 });
    expect(wiring.supabaseRequest).toHaveBeenCalledWith('rpc/admin_reset_revenue_baseline', expect.objectContaining({ method: 'POST' }));
  });
});
