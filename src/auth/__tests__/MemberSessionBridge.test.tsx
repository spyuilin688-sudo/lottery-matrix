// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberSessionBridge } from '../MemberSessionBridge';
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
  it('stays invisible while bootstrapping the initial session and a later distinct signed-in session', async () => {
    const { client, emit } = createClient({ access_token: 'initial-token' });
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));

    emit('SIGNED_IN', { access_token: 'later-token' });
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it('does not bootstrap twice for a duplicate auth event using the same access token', async () => {
    const { client, emit } = createClient({ access_token: 'shared-token' });
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
    emit('SIGNED_IN', { access_token: 'shared-token' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('returns synchronously from an auth callback before queued bootstrap work begins', async () => {
    vi.useFakeTimers();
    const { client, emit } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

    emit('SIGNED_IN', { access_token: 'queued-token' });
    expect(bootstrap).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('captures the provider token synchronously while deferring auth work', () => {
    vi.useFakeTimers();
    const { client, emit } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

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
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

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
    render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

    emit('SIGNED_OUT', null);

    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('access-token')).toBe(false);
  });

  it('removes the current browser push subscription on signed out', async () => {
    const { client, emit } = createClient(null);
    const cleanupPush = vi.fn().mockResolvedValue(undefined);
    render(<MemberSessionBridge client={client as never} bootstrap={vi.fn()} cleanupPush={cleanupPush} />);

    emit('SIGNED_OUT', null);

    await waitFor(() => expect(cleanupPush).toHaveBeenCalledTimes(1));
  });

  it('cancels queued auth work and unsubscribes during cleanup', () => {
    vi.useFakeTimers();
    const { client, emit, unsubscribe } = createClient(null);
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<MemberSessionBridge client={client as never} bootstrap={bootstrap} />);

    emit('SIGNED_IN', { access_token: 'queued-token' });
    unmount();
    vi.runAllTimers();

    expect(bootstrap).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
