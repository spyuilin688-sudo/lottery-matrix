import { describe, expect, it, vi } from 'vitest';
import { CHAIN_STAGES } from './matrix-chain';
import { MATRIX_SERVICES } from './matrix-railway-evidence';
import { createWatchdogStatusStore, sanitizeWatchdogStatus } from './watchdog-status';

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
  it('retains the card-only recovery reason in the saved heartbeat', async () => {
    const database = createDatabase();
    await createWatchdogStatusStore(database).save({
      ...heartbeat,
      actions: [{ lottery: '今彩539', target: 'railway', reasons: ['card-missing'], outcome: 'accepted' }],
    });
    expect(database.add).toHaveBeenCalledWith('matrix-watchdog-status', [
      expect.objectContaining({ actions: [{ lottery: '今彩539', target: 'railway', reasons: ['card-missing'], outcome: 'accepted' }] }),
    ]);
  });
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


describe('read-only watchdog observations', () => {
  const checkedAt = '2026-09-21T02:10:00.000Z';
  const reports = ['今彩539','天天樂','六合彩','大樂透'].map(lottery => ({lottery,drawPeriod:'12006',checkedAt,
    stages:CHAIN_STAGES.map(stage=>({stage,state:'PASS',source:'supabase',observedAt:checkedAt,period:'12006',code:'VERIFIED'}))}));
  const detail = {status:'degraded',completedAt:'2026-09-21T02:00:00.000Z',reports,
    observation:{checkedAt,status:'ok',source:'read-only-chain',token:'secret'}};
  it('preserves the verified observation with its own time and only safe metadata', () => {
    expect(sanitizeWatchdogStatus(detail).observation).toEqual({checkedAt,status:'ok',source:'read-only-chain'});
    expect(sanitizeWatchdogStatus(detail).status).toBe('degraded');
  });
  it.each(['invalid','2026-09-20T00:00:00Z'])('rejects invalid or mismatched observation time %s', time => {
    expect(sanitizeWatchdogStatus({...detail,observation:{...detail.observation,checkedAt:time}})).not.toHaveProperty('observation');
  });
  it('cannot claim success with partial or failing chains', () => {
    expect(sanitizeWatchdogStatus({...detail,reports:reports.slice(0,3)})).not.toHaveProperty('observation');
    const failed = reports.map(report=>({...report,stages:report.stages.map(stage=>({...stage,state:'FAIL'}))}));
    expect(sanitizeWatchdogStatus({...detail,reports:failed}).observation).toMatchObject({status:'degraded'});
  });
  it('keeps historical Railway failures separate from current read-only diagnoses', () => {
    const historicalRailway = [{service:'lottery-matrix',serviceId:MATRIX_SERVICES['lottery-matrix'],
      observedAt:'2026-09-21T01:00:00.000Z',code:'OBSERVED',cronSchedule:'3 * * * *',
      deployment:{id:'old',status:'FAILED',createdAt:'2026-09-21T01:00:00.000Z'},samples:[]}];
    const current=sanitizeWatchdogStatus({...detail,railway:historicalRailway});
    expect(current.railway?.[0].deployment?.status).toBe('FAILED');
    expect(current.diagnoses?.[0].checks.find(check=>check.name==='lottery-matrix:deployment'))
      .toMatchObject({state:'UNKNOWN',code:'DEPLOYMENT_UNAVAILABLE'});
    const historical=sanitizeWatchdogStatus({...detail,observation:undefined,railway:historicalRailway});
    expect(historical.diagnoses?.[0].checks.find(check=>check.name==='lottery-matrix:deployment'))
      .toMatchObject({state:'FAIL',code:'FAILED'});
  });
  it('never stores a request observation as the scheduler heartbeat', async () => {
    const database=createDatabase();await createWatchdogStatusStore(database).save(detail);
    expect(database.add.mock.calls[0][1][0]).not.toHaveProperty('observation');
  });
});
