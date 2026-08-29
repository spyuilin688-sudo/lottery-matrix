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
  };
});

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

import { secrets as appDeploySecrets } from '@appdeploy/sdk';
import { handler } from './index';

const routes = handler as unknown as Record<string, unknown[]>;

describe('admin Railway route wiring', () => {
  it('keeps the system and legacy routes without a duplicate Railway route', () => {
    expect(routes).toHaveProperty('GET /api/algorithm-status');
    expect(routes).toHaveProperty('GET /api/system-status');
    expect(routes).toHaveProperty('POST /api/system-status/:id/retry');
    expect(routes).not.toHaveProperty('GET /api/admin/worker/status');
    expect(routes['GET /api/algorithm-status']).toHaveLength(3);
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
    expect(wiring.getWorkerConfig).toHaveBeenCalledWith(appDeploySecrets);

    expect(wiring.createConnectionStatus).toHaveBeenCalledTimes(1);
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    await expect(dependencies.getWorkerStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
    expect(wiring.workerGetStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps the approved permissions on the legacy and system status routes', async () => {
    wiring.requirePermission.mockClear();
    wiring.requireModulePermission.mockClear();
    const context = {
      params: {},
      user: { email: 'admin@example.com' },
    };

    const algorithmGuard = routes['GET /api/algorithm-status'][1] as (
      input: typeof context,
    ) => Promise<unknown>;
    const systemGuard = routes['GET /api/system-status'][1] as (
      input: typeof context,
    ) => Promise<unknown>;
    const retryGuard = routes['POST /api/system-status/:id/retry'][1] as (
      input: typeof context,
    ) => Promise<unknown>;

    await algorithmGuard(context);
    expect(wiring.requirePermission).toHaveBeenCalledWith(wiring.admin, 'view');
    expect(wiring.requireModulePermission).not.toHaveBeenCalled();

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
    expect(wiring.requirePermission).toHaveBeenCalledTimes(1);
  });
});
