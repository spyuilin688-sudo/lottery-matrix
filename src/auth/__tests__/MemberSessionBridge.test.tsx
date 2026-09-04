// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberSessionBridge } from '../MemberSessionBridge';
import { endActiveMemberOnlineSession, startMemberOnlineTracking } from '../../member-online';
import {
  clearLineAuthEphemeralState,
  isLineProviderTokenRevokedFor,
  markLineProviderTokenRevokedFor,
  readLineProviderToken,
  rememberLineProviderToken,
} from '../line-provider-token';

type AuthStateCallback = (event: string, session: Session | null) => void;
type Session = {
  access_token: string;
  provider_token?: string;
};

const noopStartTracking = () => () => undefined;

function accessTokenForSession(sessionId: string, version: string) {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ session_id: sessionId, version })}.signature`;
}

function createClient(initialSession: Session | null) {
  let authStateCallback: AuthStateCallback | undefined;
  const unsubscribe = vi.fn();

  return {
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: initialSession }, error: null }),
        onAuthStateChange: vi.fn((callback: AuthStateCallback) => {
          authStateCallback = callback;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
    },
    emit(event: string, session: Session | null) {
      authStateCallback?.(event, session);
    },
    unsubscribe,
  };
}

afterEach(() => {
  cleanup();
  clearLineAuthEphemeralState();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  clearLineAuthEphemeralState();
});

describe('MemberSessionBridge', () => {
  it('does not start member online tracking for an anonymous session', async () => {
    const { client } = createClient(null);
    const startTracking = vi.fn(() => vi.fn());

    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockResolvedValue(undefined)}
        startTracking={startTracking}
      />,
    );

    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTracking).not.toHaveBeenCalled();
  });

  it('starts member online tracking only after member bootstrap succeeds', async () => {
    let resolveBootstrap: (() => void) | undefined;
    const bootstrap = vi.fn(() => new Promise<void>((resolve) => {
      resolveBootstrap = resolve;
    }));
    const { client } = createClient({ access_token: 'verified-token' });
    const startTracking = vi.fn(() => vi.fn());

    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );

    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
    expect(startTracking).not.toHaveBeenCalled();

    resolveBootstrap?.();
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));
  });

  it('does not start member online tracking when member bootstrap fails', async () => {
    const { client } = createClient({ access_token: 'failed-token' });
    const startTracking = vi.fn(() => vi.fn());

    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockRejectedValue(new Error('bootstrap failed'))}
        startTracking={startTracking}
      />,
    );

    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTracking).not.toHaveBeenCalled();
  });

  it('stops member online tracking synchronously on signed out', async () => {
    const { client, emit } = createClient({ access_token: 'signed-in-token' });
    const stopTracking = vi.fn();
    const startTracking = vi.fn(() => stopTracking);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockResolvedValue(undefined)}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('SIGNED_OUT', null);

    expect(stopTracking).toHaveBeenCalledTimes(1);
  });

  it('stops member online tracking when signed out carries the prior session', async () => {
    const priorSession = { access_token: 'signed-out-token' };
    const { client, emit } = createClient(priorSession);
    const stopTracking = vi.fn();
    const startTracking = vi.fn(() => stopTracking);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockResolvedValue(undefined)}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('SIGNED_OUT', priorSession);

    expect(stopTracking).toHaveBeenCalledTimes(1);
  });

  it('does not start tracking when bootstrap resolves after signed out carries the prior session', async () => {
    let resolveBootstrap: (() => void) | undefined;
    const bootstrap = vi.fn(() => new Promise<void>((resolve) => {
      resolveBootstrap = resolve;
    }));
    const priorSession = { access_token: 'pending-signed-out-token' };
    const { client, emit } = createClient(priorSession);
    const startTracking = vi.fn(() => vi.fn());
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    emit('SIGNED_OUT', priorSession);
    resolveBootstrap?.();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTracking).not.toHaveBeenCalled();
  });

  it('stops member online tracking when an auth event has no session', async () => {
    const { client, emit } = createClient({ access_token: 'signed-in-token' });
    const stopTracking = vi.fn();
    const startTracking = vi.fn(() => stopTracking);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockResolvedValue(undefined)}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('TOKEN_REFRESHED', null);

    expect(stopTracking).toHaveBeenCalledTimes(1);
  });

  it('stops member online tracking during unmount', async () => {
    const { client } = createClient({ access_token: 'signed-in-token' });
    const stopTracking = vi.fn();
    const startTracking = vi.fn(() => stopTracking);
    const { unmount } = render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockResolvedValue(undefined)}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    unmount();

    expect(stopTracking).toHaveBeenCalledTimes(1);
  });

  it('does not start tracking when bootstrap resolves after unmount', async () => {
    let resolveBootstrap: (() => void) | undefined;
    const bootstrap = vi.fn(() => new Promise<void>((resolve) => {
      resolveBootstrap = resolve;
    }));
    const { client } = createClient({ access_token: 'unmounted-token' });
    const startTracking = vi.fn(() => vi.fn());
    const { unmount } = render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    unmount();
    resolveBootstrap?.();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTracking).not.toHaveBeenCalled();
  });

  it('stops the old tracker and starts a new one for a distinct signed-in session', async () => {
    const { client, emit } = createClient({ access_token: 'first-token' });
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();
    const startTracking = vi.fn()
      .mockReturnValueOnce(stopFirst)
      .mockReturnValueOnce(stopSecond);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('SIGNED_IN', { access_token: 'second-token' });

    expect(stopFirst).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(2));
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(stopSecond).not.toHaveBeenCalled();
  });

  it('does not bootstrap or start another tracker for the same session', async () => {
    const { client, emit } = createClient({ access_token: 'shared-token' });
    const startTracking = vi.fn(() => vi.fn());
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('TOKEN_REFRESHED', { access_token: 'shared-token' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(startTracking).toHaveBeenCalledTimes(1);
  });

  it('keeps one tracker when a refreshed access token has the same logical session id', async () => {
    const firstToken = accessTokenForSession('stable-session', 'first');
    const refreshedToken = accessTokenForSession('stable-session', 'refreshed');
    const { client, emit } = createClient({ access_token: firstToken });
    const stopTracking = vi.fn();
    const startTracking = vi.fn(() => stopTracking);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('TOKEN_REFRESHED', { access_token: refreshedToken });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(startTracking).toHaveBeenCalledTimes(1);
    expect(stopTracking).not.toHaveBeenCalled();
  });

  it('replaces the tracker when a refreshed token belongs to a distinct logical session id', async () => {
    const { client, emit } = createClient({
      access_token: accessTokenForSession('first-session', 'first'),
    });
    const stopFirst = vi.fn();
    const startTracking = vi.fn()
      .mockReturnValueOnce(stopFirst)
      .mockReturnValueOnce(vi.fn());
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('TOKEN_REFRESHED', {
      access_token: accessTokenForSession('second-session', 'refreshed'),
    });

    expect(stopFirst).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(2));
    expect(bootstrap).toHaveBeenCalledTimes(2);
  });

  it('does not replace a paused tracker during an uncertain logout token refresh', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const firstToken = accessTokenForSession('paused-session', 'first');
    const refreshedToken = accessTokenForSession('paused-session', 'refreshed');
    const { client, emit } = createClient({ access_token: firstToken });
    let nextPresenceId = 0;
    const post = vi.fn(async (path: string) => (
      path.endsWith('/start') ? { sessionId: `presence-${++nextPresenceId}` } : { onlineSeconds: 1 }
    ));
    const startTracking = vi.fn(() => startMemberOnlineTracking(post, document));
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn().mockResolvedValue(undefined)}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));
    const resume = await endActiveMemberOnlineSession();

    emit('TOKEN_REFRESHED', { access_token: refreshedToken });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startTracking).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.filter(([path]) => path.endsWith('/start'))).toHaveLength(1);

    resume();
    await waitFor(() => {
      expect(post.mock.calls.filter(([path]) => path.endsWith('/start'))).toHaveLength(2);
    });
  });

  it('falls back safely for a malformed legacy access token', async () => {
    const { client, emit } = createClient({ access_token: 'legacy.not-base64url.signature' });
    const startTracking = vi.fn(() => vi.fn());
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));

    emit('TOKEN_REFRESHED', { access_token: 'legacy.not-base64url.signature' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(startTracking).toHaveBeenCalledTimes(1);
  });

  it('does not start tracking when bootstrap resolves after signed out', async () => {
    let resolveBootstrap: (() => void) | undefined;
    const bootstrap = vi.fn(() => new Promise<void>((resolve) => {
      resolveBootstrap = resolve;
    }));
    const { client, emit } = createClient({ access_token: 'stale-token' });
    const startTracking = vi.fn(() => vi.fn());
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    emit('SIGNED_OUT', null);
    resolveBootstrap?.();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTracking).not.toHaveBeenCalled();
  });

  it('ignores an old bootstrap resolution after a distinct session takes over', async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const bootstrap = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveSecond = resolve;
      }));
    const { client, emit } = createClient({ access_token: 'first-token' });
    const startTracking = vi.fn(() => vi.fn());
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        startTracking={startTracking}
      />,
    );
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    emit('SIGNED_IN', { access_token: 'second-token' });
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
    resolveFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startTracking).not.toHaveBeenCalled();

    resolveSecond?.();
    await waitFor(() => expect(startTracking).toHaveBeenCalledTimes(1));
  });

  it('stays invisible while bootstrapping the initial session and a later distinct signed-in session', async () => {
    const { client, emit } = createClient({ access_token: 'initial-token' });
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />,
    );

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    emit('SIGNED_IN', { access_token: 'later-token' });
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it('does not bootstrap twice for a duplicate auth event using the same access token', async () => {
    const { client, emit } = createClient({ access_token: 'shared-token' });
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />);

    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
    emit('SIGNED_IN', { access_token: 'shared-token' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('returns synchronously from an auth callback before queued bootstrap work begins', async () => {
    vi.useFakeTimers();
    const { client, emit } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />);

    emit('SIGNED_IN', { access_token: 'queued-token' });
    expect(bootstrap).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('captures the provider token synchronously while deferring auth work', () => {
    vi.useFakeTimers();
    const { client, emit } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />);

    emit('SIGNED_IN', { access_token: 'queued-token', provider_token: 'secret-provider-token' });

    expect(readLineProviderToken()).toBe('secret-provider-token');
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('retries a rejected bootstrap on a later event without logging session data', async () => {
    vi.useFakeTimers();
    const { client, emit } = createClient(null);
    const bootstrap = vi.fn().mockRejectedValueOnce(new Error('bootstrap failed')).mockResolvedValueOnce(undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />);

    emit('SIGNED_IN', { access_token: 'retry-token', provider_token: 'secret-provider-token' });
    await vi.runAllTimersAsync();
    expect(bootstrap).toHaveBeenCalledTimes(1);

    emit('TOKEN_REFRESHED', { access_token: 'retry-token' });
    await vi.runAllTimersAsync();

    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('clears all ephemeral LINE auth state on signed out', () => {
    const { client, emit } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    rememberLineProviderToken('secret-provider-token');
    markLineProviderTokenRevokedFor('access-token');
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />);

    emit('SIGNED_OUT', null);

    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('access-token')).toBe(false);
  });

  it('removes the current browser push subscription on signed out', async () => {
    const { client, emit } = createClient(null);
    const cleanupPush = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={vi.fn()}
        cleanupPush={cleanupPush}
        startTracking={noopStartTracking}
      />,
    );

    emit('SIGNED_OUT', null);

    await waitFor(() => expect(cleanupPush).toHaveBeenCalledTimes(1));
  });

  it('cancels queued auth work and unsubscribes during cleanup', () => {
    vi.useFakeTimers();
    const { client, emit, unsubscribe } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <MemberSessionBridge client={client as never} bootstrap={bootstrap} startTracking={noopStartTracking} />,
    );

    emit('SIGNED_IN', { access_token: 'queued-token' });
    unmount();
    vi.runAllTimers();

    expect(bootstrap).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
