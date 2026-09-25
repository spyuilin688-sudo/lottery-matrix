// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endActiveMemberOnlineSession, startMemberOnlineTracking } from './member-online';

afterEach(() => vi.useRealTimers());

describe('member online tracking', () => {
  it('does not end or restart a session for a brief hidden and visible bounce', async () => {
    vi.useFakeTimers();
    const post = vi.fn(async (path: string) => path.endsWith('/start') ? { sessionId: 'one' } : {});
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve(); await Promise.resolve();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(post).toHaveBeenCalledTimes(1);
    await stop();
  });

  it('cleans up listeners and starts again after a real background transition', async () => {
    vi.useFakeTimers();
    let count = 0;
    const post = vi.fn(async (path: string) => path.endsWith('/start')
      ? { sessionId: `session-${++count}` } : {});
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve(); await Promise.resolve();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(post.mock.calls.filter(([path]) => path.endsWith('/end'))).toHaveLength(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(post.mock.calls.filter(([path]) => path.endsWith('/start'))).toHaveLength(2);
    await stop();
    const calls = post.mock.calls.length;
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(post).toHaveBeenCalledTimes(calls);
  });

  it('does not start for a StrictMode owner removed in the same mount turn', async () => {
    const post = vi.fn(async () => ({ sessionId: 'only-current-owner' }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stopOld = startMemberOnlineTracking(post, document);
    const oldEnd = stopOld();
    const stopCurrent = startMemberOnlineTracking(post, document);
    await oldEnd;
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await stopCurrent();
  });

  it('waits for the previous owner end before a new owner starts', async () => {
    let finishOldEnd!: () => void;
    const oldEnd = new Promise<Record<string, unknown>>(resolve => { finishOldEnd = () => resolve({}); });
    let starts = 0;
    const post = vi.fn((path: string) => path.endsWith('/start')
      ? Promise.resolve({ sessionId: `session-${++starts}` }) : oldEnd);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stopOld = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(starts).toBe(1));
    const stopped = stopOld();
    const stopNew = startMemberOnlineTracking(post, document);
    await Promise.resolve(); await Promise.resolve();
    expect(starts).toBe(1);
    finishOldEnd();
    await stopped;
    await vi.waitFor(() => expect(starts).toBe(2));
    await stopNew();
  });

  it('restarts after pagehide and pageshow while an end is pending', async () => {
    let finishEnd!: () => void;
    const pendingEnd = new Promise<Record<string, unknown>>(resolve => { finishEnd = () => resolve({}); });
    let starts = 0;
    const post = vi.fn((path: string) => path.endsWith('/start')
      ? Promise.resolve({ sessionId: `session-${++starts}` }) : pendingEnd);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(starts).toBe(1));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    expect(starts).toBe(1);
    finishEnd();
    await vi.waitFor(() => expect(starts).toBe(2));
    await stop();
  });

  it('restarts after pagehide and pageshow while the first start is pending', async () => {
    let finishStart!: () => void;
    const pendingStart = new Promise<Record<string, unknown>>(resolve => { finishStart = () => resolve({ sessionId: 'first' }); });
    let starts = 0;
    const post = vi.fn((path: string) => path.endsWith('/start')
      ? ++starts === 1 ? pendingStart : Promise.resolve({ sessionId: 'second' })
      : Promise.resolve({}));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve();
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    finishStart();
    await vi.waitFor(() => expect(starts).toBe(2));
    expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'first' });
    await stop();
  });

  it('eventually ends the current hidden session after a stale end is skipped', async () => {
    vi.useFakeTimers();
    let finishStart!: () => void;
    const pendingStart = new Promise<Record<string, unknown>>(resolve => { finishStart = () => resolve({ sessionId: 'delayed' }); });
    const post = vi.fn((path: string) => path.endsWith('/start') ? pendingStart : Promise.resolve({}));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1_500);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    finishStart();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'delayed' });
    await stop();
  });

  it('forces an end on logout even when an older hidden end became stale', async () => {
    vi.useFakeTimers();
    let finishStart!: () => void;
    const pendingStart = new Promise<Record<string, unknown>>(resolve => { finishStart = () => resolve({ sessionId: 'logout-pending' }); });
    const post = vi.fn((path: string) => path.endsWith('/start') ? pendingStart : Promise.resolve({}));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1_500);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    const finished = stop();
    finishStart();
    await finished;
    expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'logout-pending' });
  });
  it('starts on a visible PWA and ends when it moves to the background', async () => {
    const post = vi.fn(async (path: string) => path.endsWith('/start')
      ? { sessionId: 'session-1' }
      : { onlineSeconds: 60 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 1_550));
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

  it('sends the final end before a hidden page is suspended', async () => {
    vi.useFakeTimers();
    const post = vi.fn(async (path: string) => path.endsWith('/start') ? { sessionId: 'leave-hidden' } : {});
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve(); await Promise.resolve();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve(); await Promise.resolve();
    expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'leave-hidden' });
    await stop();
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

  it('allows only the newest overlapping pause to resume tracking', async () => {
    const post = vi.fn(async (path: string) => path.endsWith('/start')
      ? { sessionId: 'session-generation' }
      : { onlineSeconds: 10 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));

    const firstResume = await endActiveMemberOnlineSession();
    const newestResume = await endActiveMemberOnlineSession();
    firstResume();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(post).toHaveBeenCalledTimes(2);

    newestResume();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(post).toHaveBeenLastCalledWith('/api/member-online/start', {});
    stop();
  });

  it('waits for a pending end before starting the next visible session', async () => {
    let resolveEnd: ((value: Record<string, unknown>) => void) | undefined;
    const pendingEnd = new Promise<Record<string, unknown>>((resolve) => {
      resolveEnd = resolve;
    });
    let startCount = 0;
    const post = vi.fn((path: string) => {
      if (path.endsWith('/start')) {
        startCount += 1;
        return Promise.resolve({ sessionId: `session-${startCount}` });
      }
      return pendingEnd;
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    const stop = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(startCount).toBe(1));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 1_550));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'session-1' }));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startCount).toBe(1);

    resolveEnd?.({ onlineSeconds: 3 });
    await vi.waitFor(() => expect(startCount).toBe(2));
    stop();
  });

  it('starts a new session if the page returns before the first start and end finish', async () => {
    let resolveStart: ((value: Record<string, unknown>) => void) | undefined;
    let resolveEnd: ((value: Record<string, unknown>) => void) | undefined;
    const firstStart = new Promise<Record<string, unknown>>((resolve) => { resolveStart = resolve; });
    const firstEnd = new Promise<Record<string, unknown>>((resolve) => { resolveEnd = resolve; });
    let starts = 0;
    const post = vi.fn((path: string) => {
      if (path.endsWith('/start')) return ++starts === 1 ? firstStart : Promise.resolve({ sessionId: 'session-2' });
      return firstEnd;
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stop = startMemberOnlineTracking(post, document);
    await Promise.resolve();
    expect(starts).toBe(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    resolveStart?.({ sessionId: 'session-1' });
    await new Promise((resolve) => setTimeout(resolve, 1_550));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/end', { sessionId: 'session-1' }));
    expect(starts).toBe(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    resolveEnd?.({ onlineSeconds: 2 });
    await vi.waitFor(() => expect(starts).toBe(2));
    stop();
  });
});
