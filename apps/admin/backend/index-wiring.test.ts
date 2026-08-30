import { describe, expect, it, vi } from 'vitest';

const wiring = vi.hoisted(() => {
  const workerStatus = { ok: false, health: null, jobs: null } as const;
  const workerGetStatus = vi.fn(async () => workerStatus);
  const getWorkerConfig = vi.fn(async () => ({
    baseUrl: 'https://railway.example',
    statusToken: 'server-token',
  }));
  const createWorkerApi = vi.fn(() => ({ getStatus: workerGetStatus }));
  const connectionGet = vi.fn(async () => ({ checkedAt: 'test', items: [] }));
  const connectionRetry = vi.fn(async () => ({ id: 'test' }));
  const createConnectionStatus = vi.fn(() => ({
    get: connectionGet,
    retry: connectionRetry,
  }));
  const admin = {
    id: 'admin-1',
    account: 'admin@example.com',
    name: '管理員',
    role: '超級管理員',
  };
  const requireAdmin = vi.fn(async () => admin);
  const requirePermission = vi.fn();
  const requireModulePermission = vi.fn();
  const shouldRecordAdminActivity = vi.fn(() => false);
  const listMemberPushStatus = vi.fn(async () => [{ userId: 'member-1' }]);
  const sendMemberTestPush = vi.fn(async () => ({ sent: 1, failed: 0 }));
  const listPushDeliveryLogs = vi.fn(async () => [{ id: 'log-1' }]);
  const createPushNotifications = vi.fn(() => ({
    listMemberPushStatus,
    sendMemberTestPush,
    listPushDeliveryLogs,
  }));
  return {
    workerGetStatus,
    getWorkerConfig,
    createWorkerApi,
    createConnectionStatus,
    admin,
    requireAdmin,
    requirePermission,
    requireModulePermission,
    shouldRecordAdminActivity,
    listMemberPushStatus,
    sendMemberTestPush,
    listPushDeliveryLogs,
    createPushNotifications,
  };
});

const sdk = vi.hoisted(() => {
  const authMiddlewares: Array<ReturnType<typeof vi.fn> & { auth: true }> = [];
  const requireAuth = vi.fn(() => {
    const middleware = Object.assign(vi.fn(), { auth: true as const });
    authMiddlewares.push(middleware);
    return middleware;
  });
  return {
    authMiddlewares,
    requireAuth,
    router: vi.fn((registeredRoutes: Record<string, unknown[]>) => registeredRoutes),
    json: vi.fn((body: unknown, status = 200) => ({ body, status })),
    error: vi.fn((message: string, status = 500) => ({ error: message, status })),
    secrets: { kind: 'test-secrets' },
  };
});

vi.mock('@appdeploy/sdk', () => sdk);

vi.mock('./worker-api', () => ({
  createWorkerApi: wiring.createWorkerApi,
  getWorkerConfig: wiring.getWorkerConfig,
}));

vi.mock('./connection-status', () => ({
  createConnectionStatus: wiring.createConnectionStatus,
}));

vi.mock('./admin-auth', () => ({
  requireAdmin: wiring.requireAdmin,
  requirePermission: wiring.requirePermission,
  requireModulePermission: wiring.requireModulePermission,
  shouldRecordAdminActivity: wiring.shouldRecordAdminActivity,
}));

vi.mock('./push-notifications', async (importOriginal) => ({
  ...await importOriginal<typeof import('./push-notifications')>(),
  createPushNotifications: wiring.createPushNotifications,
}));

import { handler } from './index';

const routes = handler as unknown as Record<string, unknown[]>;

describe('admin Railway route wiring', () => {
  it('keeps system status and removes the legacy algorithm status route', () => {
    expect(routes).not.toHaveProperty('GET /api/algorithm-status');
    expect(routes).toHaveProperty('GET /api/system-status');
    expect(routes).toHaveProperty('POST /api/system-status/:id/retry');
    expect(routes).not.toHaveProperty('GET /api/admin/worker/status');
    expect(routes['GET /api/system-status']).toHaveLength(3);
    expect(routes['POST /api/system-status/:id/retry']).toHaveLength(3);
  });

  it('loads both Railway secrets and passes Worker status into system status', async () => {
    expect(wiring.createWorkerApi).toHaveBeenCalledTimes(1);
    const loadConfig = wiring.createWorkerApi.mock.calls[0][0];
    await expect(loadConfig()).resolves.toMatchObject({
      baseUrl: 'https://railway.example',
      statusToken: 'server-token',
    });
    expect(wiring.getWorkerConfig).toHaveBeenCalledWith(sdk.secrets);

    expect(wiring.createConnectionStatus).toHaveBeenCalledTimes(1);
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    await expect(dependencies.getWorkerStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
    expect(wiring.workerGetStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps the approved permissions on the system status routes', async () => {
    wiring.requirePermission.mockClear();
    wiring.requireModulePermission.mockClear();
    const context = {
      params: {},
      user: { email: 'admin@example.com' },
    };

    const systemGuard = routes['GET /api/system-status'][1] as (
      input: typeof context,
    ) => Promise<unknown>;
    const retryGuard = routes['POST /api/system-status/:id/retry'][1] as (
      input: typeof context,
    ) => Promise<unknown>;

    await systemGuard(context);
    await retryGuard(context);
    expect(wiring.requireModulePermission).toHaveBeenNthCalledWith(
      1,
      wiring.admin,
      'systemSettings',
      'view',
    );
    expect(wiring.requireModulePermission).toHaveBeenNthCalledWith(
      2,
      wiring.admin,
      'systemSettings',
      'view',
    );
    expect(wiring.requirePermission).not.toHaveBeenCalled();
  });
});

describe('admin push notification route wiring', () => {
  it('registers the exact authenticated routes with global view/edit permissions', async () => {
    wiring.requirePermission.mockClear();
    const context = {
      params: { id: 'member-1' },
      user: { email: 'admin@example.com' },
    };
    const expected = [
      ['GET /api/push-members', 'view'],
      ['POST /api/push-members/:id/test', 'edit'],
      ['GET /api/push-delivery-logs', 'view'],
    ] as const;

    for (const [route, permission] of expected) {
      expect(routes).toHaveProperty(route);
      expect(routes[route]).toHaveLength(3);
      expect((routes[route][0] as { auth?: boolean }).auth).toBe(true);
      const routeGuard = routes[route][1] as (input: typeof context) => Promise<unknown>;
      await routeGuard(context);
      expect(wiring.requirePermission).toHaveBeenLastCalledWith(wiring.admin, permission);
    }
  });

  it('sends only the route member and the authenticated administrator account', async () => {
    wiring.sendMemberTestPush.mockClear();
    wiring.requireAdmin.mockClear();
    const routeHandler = routes['POST /api/push-members/:id/test'][2] as (
      input: { params: { id: string }; body: unknown; user: { email: string } },
    ) => Promise<unknown>;

    await routeHandler({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      body: { adminAccount: 'attacker@example.com', userId: 'member-2' },
      user: { email: 'admin@example.com' },
    });

    expect(wiring.requireAdmin).toHaveBeenCalledWith('admin@example.com', expect.any(Object));
    expect(wiring.sendMemberTestPush).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'admin@example.com',
    );
  });

  it('returns HTTP 400 for a malformed member path before calling the push API', async () => {
    wiring.sendMemberTestPush.mockClear();
    const routeHandler = routes['POST /api/push-members/:id/test'][2] as (
      input: { params: { id: string }; user: { email: string } },
    ) => Promise<unknown>;

    await expect(routeHandler({
      params: { id: 'member-1' },
      user: { email: 'admin@example.com' },
    })).resolves.toEqual({ error: 'INVALID_MEMBER_ID', status: 400 });
    expect(wiring.sendMemberTestPush).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'INVALID_REQUEST'],
    [409, 'NO_ACTIVE_SUBSCRIPTIONS'],
  ])('returns the safe Edge HTTP %i business failure', async (statusCode, message) => {
    wiring.sendMemberTestPush.mockRejectedValueOnce(Object.assign(new Error(message), { statusCode }));
    const routeHandler = routes['POST /api/push-members/:id/test'][2] as (
      input: { params: { id: string }; user: { email: string } },
    ) => Promise<unknown>;

    await expect(routeHandler({
      params: { id: '11111111-1111-4111-8111-111111111111' },
      user: { email: 'admin@example.com' },
    })).resolves.toEqual({ error: message, status: statusCode });
  });

  it('routes list requests to the member status and delivery log APIs', async () => {
    const context = { params: {}, user: { email: 'admin@example.com' } };
    const memberHandler = routes['GET /api/push-members'][2] as (input: typeof context) => Promise<unknown>;
    const logHandler = routes['GET /api/push-delivery-logs'][2] as (input: typeof context) => Promise<unknown>;

    await expect(memberHandler(context)).resolves.toMatchObject({
      body: { items: [{ userId: 'member-1' }] },
    });
    await expect(logHandler(context)).resolves.toMatchObject({
      body: { items: [{ id: 'log-1' }] },
    });
  });
});
