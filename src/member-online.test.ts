// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { endActiveMemberOnlineSession, startMemberOnlineTracking } from './member-online';

describe('member online tracking', () => {
  it('starts on a visible PWA and ends when it moves to the background', async () => {
    const post = vi.fn(async (path: string) => path.endsWith('/start')
      ? { sessionId: 'session-1' }
      : { onlineSeconds: 60 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'session-1' }));
    stop();
  });

  it('ends the active session when the PWA page is left', async () => {
    const post = vi.fn(async (path: string) => path.endsWith('/start')
      ? { sessionId: 'session-leave' }
      : { onlineSeconds: 15 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));

    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'session-leave' }));
    stop();
  });

  it('lets logout await the active session end and resume tracking when logout fails', async () => {
    const post = vi.fn(async (path: string) => path.endsWith('/start')
      ? { sessionId: 'session-logout' }
      : { onlineSeconds: 30 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));

    const resume = await endActiveMemberOnlineSession();

    expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'session-logout' });
    expect(post).toHaveBeenCalledTimes(2);

    resume();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(post).toHaveBeenLastCalledWith('/api/member-online/start', {});
    stop();
  });
});
