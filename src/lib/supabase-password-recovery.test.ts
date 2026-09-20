import { expect, it, vi } from 'vitest';
const createClient = vi.hoisted(() => vi.fn(() => ({ auth: {} })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
import { getPasswordRecoveryClient } from './supabase';
it('uses an isolated, non-persistent recovery client instead of an existing member session', () => {
  expect(getPasswordRecoveryClient()).toBe(getPasswordRecoveryClient());
  expect(createClient).toHaveBeenCalledTimes(1);
  expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true, storageKey: 'matrix-password-recovery' },
  }));
});
