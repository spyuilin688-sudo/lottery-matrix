import { describe, expect, it, vi } from 'vitest';
import { flushLinePwaDiagnostics } from './line-pwa-diagnostics';

const STORAGE_KEY = 'matrix-line-pwa-diagnostics-v1';

function browserWith(entries: unknown[]) {
  const storage = new Map([[STORAGE_KEY, JSON.stringify(entries)]]);
  return {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    },
  } as unknown as Window;
}

function clientWith(session: object | null, error: unknown = null) {
  return {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: error ? null : { ok: true }, error }),
  };
}

describe('LINE PWA handoff diagnostic upload', () => {
  it('uploads only allowlisted fields after authentication and clears the accepted buffer', async () => {
    const browser = browserWith([{
      at: 1_788_700_000_000,
      requestId: '1788700000000-abc123',
      code: 'PWA_FOCUS_REJECTED',
      errorName: 'InvalidAccessError',
      workerBuild: 'matrix-pwa-shell-5d038f244fc48fc4',
      elapsedMs: 1512,
      candidateCount: 1,
      access_token: 'secret-token',
      message: 'secret-message',
    }]);
    const client = clientWith({ user: { id: '11111111-1111-4111-8111-111111111111' } });

    await expect(flushLinePwaDiagnostics(browser, client)).resolves.toBe(true);

    expect(client.rpc).toHaveBeenCalledWith('member_line_pwa_diagnostics_submit', {
      p_events: [{
        at: 1_788_700_000_000,
        requestId: '1788700000000-abc123',
        code: 'PWA_FOCUS_REJECTED',
        errorName: 'InvalidAccessError',
        workerBuild: 'matrix-pwa-shell-5d038f244fc48fc4',
        elapsedMs: 1512,
        candidateCount: 1,
      }],
    });
    expect(JSON.stringify(client.rpc.mock.calls)).not.toContain('secret');
    expect(browser.localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('keeps diagnostics locally when no authenticated session exists', async () => {
    const browser = browserWith([{ requestId: '1788700000000-abc123', code: 'PWA_CLIENT_NOT_FOUND' }]);
    const client = clientWith(null);

    await expect(flushLinePwaDiagnostics(browser, client)).resolves.toBe(false);

    expect(client.rpc).not.toHaveBeenCalled();
    expect(browser.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('keeps diagnostics locally when Supabase rejects the upload', async () => {
    const browser = browserWith([{ requestId: '1788700000000-abc123', code: 'PWA_CLIENT_NOT_FOUND' }]);
    const client = clientWith({ user: { id: '11111111-1111-4111-8111-111111111111' } }, { code: '42501' });

    await expect(flushLinePwaDiagnostics(browser, client)).resolves.toBe(false);

    expect(browser.localStorage.removeItem).not.toHaveBeenCalled();
  });
});
