import { describe, expect, it } from 'vitest';
import { getServiceEvidenceFacts, getSystemStatusPresentation, type SystemStatusItem } from './system-status';

const base = (overrides: Partial<SystemStatusItem> = {}): SystemStatusItem => ({
  id: 'example',
  name: 'Example',
  description: 'Example',
  group: '系統',
  location: 'Supabase',
  endpoint: '/rest/v1/rpc/example',
  checkMode: 'registry',
  checkEvidence: 'registered',
  ok: true,
  checkedAt: '2026-09-21T12:00:00Z',
  responseMs: 1,
  ...overrides,
});

describe('system status verification levels', () => {
  it.each([
    ['query', '實際查詢已驗證', '實際查詢'],
    ['data', '正式資料已驗證', '正式資料'],
    ['live', '即時檢查正常', '即時連線／讀取'],
    ['options', 'Endpoint 已驗證', 'Endpoint 連線'],
    ['inherited', '所屬服務已驗證', '所屬服務'],
    ['reported', '執行紀錄正常', '正式執行紀錄'],
  ] as const)('labels %s evidence by what was actually verified', (checkEvidence, label, method) => {
    const item = base({ checkEvidence, checkMode: checkEvidence === 'inherited' ? 'service' : 'live' });
    expect(getSystemStatusPresentation(item)).toMatchObject({ label });
    expect(getServiceEvidenceFacts(item)).toContainEqual({ label: '驗證方式', value: method });
  });

  it('describes member reads as requiring the member identity flow instead of implying failure', () => {
    const item = base({
      id: 'supabase-rpc-member_profile',
      rpcAccess: 'member-read',
    });
    expect(getSystemStatusPresentation(item)).toMatchObject({
      label: '需會員流程驗證',
      tone: 'limited',
      scope: expect.stringContaining('會員登入'),
    });
    expect(getServiceEvidenceFacts(item)).toContainEqual({ label: '驗證方式', value: 'API 註冊＋會員流程未執行' });
  });

  it('describes write operations without execution evidence as intentionally not executed', () => {
    const item = base({ rpcAccess: 'operation' });
    expect(getSystemStatusPresentation(item)).toMatchObject({
      label: 'API 已確認',
      tone: 'limited',
      scope: expect.stringContaining('不自動執行寫入操作'),
    });
    expect(getServiceEvidenceFacts(item)).toContainEqual({ label: '驗證方式', value: 'API 註冊；寫入操作未執行' });
  });

  it('upgrades persisted operation evidence only to formal execution evidence, not a synthetic live test', () => {
    const item = base({
      rpcAccess: 'operation',
      detail: { activity: { state: 'recorded', source: '通知派送完成', observedAt: '2026-09-21T11:50:00Z' } },
    });
    expect(getSystemStatusPresentation(item)).toMatchObject({
      label: '正式執行紀錄',
      tone: 'limited',
      scope: expect.stringContaining('正式資料'),
    });
    expect(getServiceEvidenceFacts(item)).toEqual(expect.arrayContaining([
      { label: '驗證方式', value: 'API 註冊＋正式執行紀錄' },
      { label: '最近相關紀錄', value: '2026-09-21T11:50:00Z', format: 'date' },
    ]));
  });

  it('keeps absent historical evidence factual', () => {
    const item = base({
      rpcAccess: 'operation',
      detail: { activity: { state: 'none', source: '通知等待重試' } },
    });
    expect(getSystemStatusPresentation(item)).toMatchObject({
      label: '尚無執行紀錄',
      tone: 'limited',
    });
    expect(getServiceEvidenceFacts(item)).toContainEqual({ label: '驗證方式', value: 'API 註冊＋正式紀錄查核' });
  });
});
