import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  getMemberSessionSnapshot,
  installMemberSessionRefresh,
  publishMemberSessionError,
  publishMemberSessionReady,
  requestMemberSessionRefresh,
  resetMemberSessionStoreForTests,
  subscribeMemberSession,
} from './member-session-store';

const session = { access_token: 'token', user: { id: 'member-a' } } as Session;

beforeEach(() => resetMemberSessionStoreForTests());
afterEach(() => resetMemberSessionStoreForTests());

it('publishes one in-memory snapshot for member-page consumers', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeMemberSession(listener);
  expect(getMemberSessionSnapshot()).toMatchObject({ status: 'checking', session: null });

  publishMemberSessionReady(session);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(getMemberSessionSnapshot()).toMatchObject({ status: 'ready', session });

  publishMemberSessionError();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(getMemberSessionSnapshot()).toMatchObject({ status: 'error', session: null });
  unsubscribe();
});

it('coalesces concurrent page refresh requests through the installed session owner', async () => {
  let resolve!: (value: Session | null) => void;
  const refresh = vi.fn(() => new Promise<Session | null>(r => { resolve = r; }));
  const uninstall = installMemberSessionRefresh(refresh);

  const first = requestMemberSessionRefresh();
  const second = requestMemberSessionRefresh();
  expect(refresh).toHaveBeenCalledTimes(1);
  resolve(session);
  await expect(first).resolves.toBe(session);
  await expect(second).resolves.toBe(session);

  await requestMemberSessionRefresh();
  expect(refresh).toHaveBeenCalledTimes(2);
  uninstall();
});
