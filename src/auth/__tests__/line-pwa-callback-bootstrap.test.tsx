// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRoot: vi.fn(() => ({ render: vi.fn() })),
  getSession: vi.fn(),
  hasLineOAuthCallback: vi.fn(),
  isPwaDisplayMode: vi.fn(),
  requestLinePwaReturn: vi.fn(),
}));

vi.mock('react-dom/client', () => ({ default: { createRoot: mocks.createRoot } }));
vi.mock('../../input-behavior', () => ({ installGlobalInputBehavior: vi.fn() }));
vi.mock('../../push-subscription', () => ({ registerPushServiceWorker: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../visitor-counts', () => ({ installVisitorTracking: vi.fn(() => vi.fn()) }));
vi.mock('../line-pwa-diagnostics', () => ({ flushLinePwaDiagnostics: vi.fn() }));
vi.mock('../line-login-popup', () => ({ finishLineLoginPopup: vi.fn().mockResolvedValue(false) }));
vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession: mocks.getSession } }),
}));
vi.mock('../../pwa-display-mode', () => ({ isPwaDisplayMode: mocks.isPwaDisplayMode }));
vi.mock('../line-pwa-return', () => ({
  hasLineOAuthCallback: mocks.hasLineOAuthCallback,
  registerLinePwaClient: vi.fn().mockResolvedValue(true),
  requestLinePwaReturn: mocks.requestLinePwaReturn,
}));
vi.mock('../../App', () => ({ default: () => null }));

describe('LINE callback bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createRoot.mockClear();
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'signed-in' } }, error: null });
    mocks.hasLineOAuthCallback.mockReset().mockReturnValue(true);
    mocks.isPwaDisplayMode.mockReset().mockReturnValue(false);
    mocks.requestLinePwaReturn.mockReset().mockResolvedValue(false);
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active: null }), controller: null },
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile',
    });
  });

  it('shows the return action after login succeeds but automatic PWA handoff fails', async () => {
    mocks.hasLineOAuthCallback.mockReturnValueOnce(true).mockReturnValue(false);

    await import('../../main');

    await vi.waitFor(() => expect(mocks.createRoot).toHaveBeenCalledOnce());
    const renderRoot = mocks.createRoot.mock.results[0].value;
    const strictMode = renderRoot.render.mock.calls[0][0];
    const fallback = strictMode.props.children;

    expect(fallback.type.name).toBe('LinePwaReturnFallback');
    expect(fallback.props.returnHref).toMatch(/^intent:\/\//);
    expect(mocks.getSession).toHaveBeenCalledOnce();
  });

  it('does not claim success when the callback remains unconsumed despite an older session', async () => {
    await import('../../main');

    await vi.waitFor(() => expect(mocks.createRoot).toHaveBeenCalledOnce());
    const renderRoot = mocks.createRoot.mock.results[0].value;
    const strictMode = renderRoot.render.mock.calls[0][0];

    expect(strictMode.props.children.type.name).not.toBe('LinePwaReturnFallback');
    expect(mocks.getSession).toHaveBeenCalledOnce();
  });

  it('uses neutral return copy when the worker hands off an unverified callback', async () => {
    mocks.requestLinePwaReturn.mockResolvedValue(true);
    vi.spyOn(window, 'close').mockImplementation(() => undefined);

    await import('../../main');

    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(document.getElementById('root')?.textContent).toBe('正在返回樂彩 Matrix…');
    expect(document.getElementById('root')?.textContent).not.toContain('登入成功');
    expect(mocks.createRoot).not.toHaveBeenCalled();
  });

  it('continues into the application when the callback already runs inside the PWA', async () => {
    mocks.isPwaDisplayMode.mockReturnValue(true);

    await import('../../main');

    await vi.waitFor(() => expect(mocks.createRoot).toHaveBeenCalledOnce());
    const renderRoot = mocks.createRoot.mock.results[0].value;
    const strictMode = renderRoot.render.mock.calls[0][0];

    expect(strictMode.props.children.type.name).not.toBe('LinePwaReturnFallback');
    expect(mocks.getSession).toHaveBeenCalledOnce();
  });

  it('surfaces an expired callback even when an older session exists and clears its pending success marker', async () => {
    window.history.replaceState({}, '', '/?source=line&error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired');
    window.sessionStorage.setItem('matrix-line-login-pending', JSON.stringify({ startedAt: Date.now() }));
    mocks.hasLineOAuthCallback.mockReturnValueOnce(true).mockReturnValue(false);

    await import('../../main');

    await vi.waitFor(() => expect(mocks.createRoot).toHaveBeenCalledOnce());
    const app = mocks.createRoot.mock.results[0].value.render.mock.calls[0][0].props.children;
    expect(app.props.lineLoginError).toBe('expired');
    expect(app.type.name).not.toBe('LinePwaReturnFallback');
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).toBeNull();
    expect(window.location.search).toBe('?source=line');
  });

  it('reports a cancelled hash callback without reflecting the provider description', async () => {
    window.history.replaceState({}, '', '/#error=access_denied&error_description=private-provider-details');

    await import('../../main');

    await vi.waitFor(() => expect(mocks.createRoot).toHaveBeenCalledOnce());
    const app = mocks.createRoot.mock.results[0].value.render.mock.calls[0][0].props.children;
    expect(app.props.lineLoginError).toBe('cancelled');
    expect(window.location.hash).toBe('');
  });

  it('preserves callback errors for the receiving PWA when handoff succeeds', async () => {
    window.history.replaceState({}, '', '/?error=invalid_request&error_code=bad_oauth_state');
    mocks.requestLinePwaReturn.mockResolvedValue(true);
    vi.spyOn(window, 'close').mockImplementation(() => undefined);

    await import('../../main');

    await vi.waitFor(() => expect(mocks.requestLinePwaReturn).toHaveBeenCalledOnce());
    expect(window.location.search).toContain('error_code=bad_oauth_state');
    expect(mocks.createRoot).not.toHaveBeenCalled();
  });

  it('does not mislabel other state failures as an expired login', async () => {
    window.history.replaceState({}, '', '/?error=invalid_request&error_code=bad_oauth_state&error_description=state+mismatch#profile');

    await import('../../main');

    await vi.waitFor(() => expect(mocks.createRoot).toHaveBeenCalledOnce());
    const app = mocks.createRoot.mock.results[0].value.render.mock.calls[0][0].props.children;
    expect(app.props.lineLoginError).toBe('failed');
    expect(window.location.hash).toBe('#profile');
  });
});
