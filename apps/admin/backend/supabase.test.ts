import { describe, expect, it, vi } from 'vitest';
import { createSupabaseTransport, getSupabaseConfig } from './supabase';

const secretReader = (values: Record<string, string>) => ({
  listSecretNames: vi.fn(async () => Object.keys(values)),
  readSecret: vi.fn(async (name: string) => values[name] ?? null),
});

describe('getSupabaseConfig', () => {
  it('fails closed when a required backend secret is missing', async () => {
    await expect(getSupabaseConfig(secretReader({
      SUPABASE_URL: 'https://example.supabase.co',
    }))).rejects.toMatchObject({
      code: 'CONFIG_MISSING',
      statusCode: 503,
    });
  });
});

describe('createSupabaseTransport', () => {
  it.each([200, 201, 204])('accepts an empty successful minimal-write response (%s)', async (status) => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    const transport = createSupabaseTransport({ url: 'https://example.supabase.co', serviceRoleKey: 'test-key' }, fetcher);
    await expect(transport.request('/rest/v1/admin_push_subscriptions', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates, return=minimal' }, body: '{}',
    })).resolves.toBeUndefined();
  });

  it('does not treat a failed minimal write as success', async () => {
    const transport = createSupabaseTransport({ url: 'https://example.supabase.co', serviceRoleKey: 'test-key' }, async () => new Response(null, { status: 403 }));
    await expect(transport.request('/rest/v1/admin_push_subscriptions', { method: 'POST', headers: { Prefer: 'return=minimal' } })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('keeps the service role key in backend request headers', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ id: 'm1' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const transport = createSupabaseTransport({
      url: 'https://example.supabase.co/',
      serviceRoleKey: 'service-role-secret',
    }, fetcher);

    await expect(transport.request('/rest/v1/members?select=*')).resolves.toEqual([{ id: 'm1' }]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/members?select=*',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'service-role-secret',
          Authorization: 'Bearer service-role-secret',
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        }),
      }),
    );
  });

  it('returns a stable unavailable error without leaking credentials', async () => {
    const fetcher = vi.fn(async () => new Response('upstream included service-role-secret', {
      status: 502,
    }));
    const transport = createSupabaseTransport({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'service-role-secret',
    }, fetcher);

    const failure = await transport.request('/rest/v1/members').catch((error) => error);
    expect(failure).toMatchObject({ code: 'UNAVAILABLE', statusCode: 503 });
    expect(String(failure.message)).not.toContain('service-role-secret');
  });
});
