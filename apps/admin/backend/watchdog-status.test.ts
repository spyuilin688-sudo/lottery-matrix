import { describe, expect, it, vi } from 'vitest';
import { createWatchdogStatusStore } from './watchdog-status';

const heartbeat = {
  status: 'degraded',
  checkedAt: '2026-09-04T01:33:00.000Z',
  completedAt: '2026-09-04T01:34:05.000Z',
  dueLotteries: ['天天樂'],
  actions: [{
    lottery: '天天樂',
    target: 'github',
    reasons: ['crawler-stale'],
    outcome: 'failed',
  }],
  error: 'STATUS_UNAVAILABLE',
} as const;

type AppDeployDatabaseContract = {
  list<T>(table: string, options: { limit: number }): Promise<{
    items: Array<Omit<T, 'id'> & { id: string }>;
    nextToken?: string;
  }>;
  add(table: string, records: Record<string, unknown>[]): Promise<(string | null)[]>;
  update(table: string, updates: { id: string; record: Record<string, unknown> }[]): Promise<boolean[]>;
};

function createDatabase(items: Record<string, unknown>[] = []) {
  const list = vi.fn(async () => ({ items }));
  const add = vi.fn(async (): Promise<(string | null)[]> => ['created-id']);
  const update = vi.fn(async () => [true]);
  return {
    list: list as typeof list & AppDeployDatabaseContract['list'],
    add,
    update,
  };
}

function createAppDeployContractDatabase(): AppDeployDatabaseContract {
  return {
    list: async <T,>() => ({ items: [] as Array<Omit<T, 'id'> & { id: string }> }),
    add: async () => ['created-id'],
    update: async () => [true],
  };
}

describe('watchdog status store', () => {
  it('accepts the exact AppDeploy list record contract', () => {
    expect(createWatchdogStatusStore(createAppDeployContractDatabase())).toBeDefined();
  });

  it('adds one bounded singleton record when the table is empty', async () => {
    const database = createDatabase();
    const store = createWatchdogStatusStore(database);

    await expect(store.save(heartbeat)).resolves.toEqual(heartbeat);

    expect(database.list).toHaveBeenCalledWith('matrix-watchdog-status', { limit: 1 });
    expect(database.add).toHaveBeenCalledWith('matrix-watchdog-status', [heartbeat]);
    expect(database.update).not.toHaveBeenCalled();
  });

  it('replaces the single existing record by id', async () => {
    const database = createDatabase([{ id: 'heartbeat-1', ...heartbeat }]);
    const store = createWatchdogStatusStore(database);

    await store.save({ ...heartbeat, status: 'ok', error: undefined });

    expect(database.update).toHaveBeenCalledWith('matrix-watchdog-status', [{
      id: 'heartbeat-1',
      record: {
        status: 'ok',
        checkedAt: '2026-09-04T01:33:00.000Z',
        completedAt: '2026-09-04T01:34:05.000Z',
        dueLotteries: ['天天樂'],
        actions: heartbeat.actions,
      },
    }]);
    expect(database.add).not.toHaveBeenCalled();
  });

  it('loads only the sanitized singleton record', async () => {
    const database = createDatabase([{
      id: 'heartbeat-1',
      ...heartbeat,
      token: 'server-only-token',
      response: { authorization: 'Bearer secret' },
    }, { id: 'heartbeat-2', status: 'ok' }]);
    const store = createWatchdogStatusStore(database);

    await expect(store.load()).resolves.toEqual(heartbeat);
    expect(database.list).toHaveBeenCalledWith('matrix-watchdog-status', { limit: 1 });
  });

  it('persists only whitelisted fields and replaces raw errors with a safe code', async () => {
    const database = createDatabase();
    const store = createWatchdogStatusStore(database);

    await store.save({
      ...heartbeat,
      error: 'request failed with token server-only-token',
      completedAt: 'invalid server-only-token',
      dueLotteries: ['天天樂', 'server-only-token', '天天樂', '今彩539'],
      expectedDrawDates: { '天天樂': '2026-09-03' },
      token: 'server-only-token',
      response: { body: 'complete upstream response' },
      actions: [{
        ...heartbeat.actions[0],
        token: 'action-token',
        response: { body: 'complete action response' },
      }],
    });

    expect(database.add).toHaveBeenCalledWith('matrix-watchdog-status', [{
      status: 'degraded',
      checkedAt: '2026-09-04T01:33:00.000Z',
      completedAt: '2026-09-04T01:33:00.000Z',
      dueLotteries: ['天天樂', '今彩539'],
      actions: [{
        lottery: '天天樂',
        target: 'github',
        reasons: ['crawler-stale'],
        outcome: 'failed',
      }],
      error: 'WATCHDOG_FAILED',
    }]);
  });

  it('reports database read and write failures without leaking their messages', async () => {
    const readFailure = createDatabase();
    readFailure.list.mockRejectedValue(new Error('database token=read-secret'));
    const writeFailure = createDatabase();
    writeFailure.add.mockRejectedValue(new Error('database token=write-secret'));

    await expect(createWatchdogStatusStore(readFailure).load()).rejects.toThrow('WATCHDOG_STATUS_READ_FAILED');
    await expect(createWatchdogStatusStore(writeFailure).save(heartbeat)).rejects.toThrow('WATCHDOG_STATUS_WRITE_FAILED');
  });

  it('treats unsuccessful AppDeploy add and update results as safe write failures', async () => {
    const addFailure = createDatabase();
    addFailure.add.mockResolvedValue([null]);
    const updateFailure = createDatabase([{ id: 'heartbeat-1', ...heartbeat }]);
    updateFailure.update.mockResolvedValue([false]);

    await expect(createWatchdogStatusStore(addFailure).save(heartbeat)).rejects.toThrow('WATCHDOG_STATUS_WRITE_FAILED');
    await expect(createWatchdogStatusStore(updateFailure).save(heartbeat)).rejects.toThrow('WATCHDOG_STATUS_WRITE_FAILED');
  });
});
