import { describe, expect, it, vi } from 'vitest';
import { createMemberBootstrap } from './member-bootstrap';

const config = () => ({
  url: 'https://project.supabase.co',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-role-key',
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authUser(lineUserId = 'line-user-1') {
  return {
    id: 'auth-user-1',
    identities: [{ provider: 'custom:line', provider_id: lineUserId }],
  };
}

describe('member bootstrap', () => {
  it('creates a member from the verified custom:line provider_id', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json(authUser());
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          auth_user_id: 'auth-user-1',
          line_user_id: 'line-user-1',
        });
        return json([{ id: 'member-1', line_user_id: 'line-user-1' }], 201);
      }
      return json([]);
    });

    const service = createMemberBootstrap(config, fetcher as typeof fetch);

    await expect(service.bootstrap('Bearer session-token')).resolves.toEqual({
      memberId: 'member-1',
      lineUserId: 'line-user-1',
    });
  });

  it('returns the existing member when auth_user_id and line_user_id already match', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json(authUser());
      if (url.searchParams.get('auth_user_id')) {
        return json([{ id: 'member-1', auth_user_id: 'auth-user-1', line_user_id: 'line-user-1' }]);
      }
      return json([]);
    });

    const service = createMemberBootstrap(config, fetcher as typeof fetch);

    await expect(service.bootstrap('Bearer session-token')).resolves.toEqual({
      memberId: 'member-1',
      lineUserId: 'line-user-1',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fills an empty line_user_id for the same auth_user_id', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json(authUser());
      if (url.searchParams.get('auth_user_id')) {
        return json([{ id: 'member-1', auth_user_id: 'auth-user-1', line_user_id: null }]);
      }
      if (url.searchParams.get('line_user_id') && init?.method !== 'PATCH') return json([]);
      if (init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ line_user_id: 'line-user-1' });
        return json([{ id: 'member-1', line_user_id: 'line-user-1' }]);
      }
      return json([]);
    });

    const service = createMemberBootstrap(config, fetcher as typeof fetch);

    await expect(service.bootstrap('Bearer session-token')).resolves.toEqual({
      memberId: 'member-1',
      lineUserId: 'line-user-1',
    });
  });

  it('returns 409 when the auth user is already bound to another line_user_id', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json(authUser('line-new'));
      return json([{ id: 'member-1', auth_user_id: 'auth-user-1', line_user_id: 'line-old' }]);
    });

    const service = createMemberBootstrap(config, fetcher as typeof fetch);

    await expect(service.bootstrap('Bearer session-token')).rejects.toMatchObject({
      status: 409,
      code: 'LINE_IDENTITY_CONFLICT',
    });
  });

  it('returns 409 when line_user_id belongs to another auth_user_id', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return json(authUser());
      if (url.searchParams.get('auth_user_id')) return json([]);
      if (url.searchParams.get('line_user_id')) {
        return json([{ id: 'member-2', auth_user_id: 'auth-user-2', line_user_id: 'line-user-1' }]);
      }
      return json([]);
    });

    const service = createMemberBootstrap(config, fetcher as typeof fetch);

    await expect(service.bootstrap('Bearer session-token')).rejects.toMatchObject({
      status: 409,
      code: 'LINE_IDENTITY_CONFLICT',
    });
  });

  it('rejects a Supabase user without custom:line identity', async () => {
    const fetcher = vi.fn(async () => json({
      id: 'auth-user-1',
      identities: [{ provider: 'email', provider_id: 'email-user' }],
    }));

    const service = createMemberBootstrap(config, fetcher as typeof fetch);

    await expect(service.bootstrap('Bearer session-token')).rejects.toMatchObject({
      status: 403,
      code: 'LINE_IDENTITY_REQUIRED',
    });
  });
});
