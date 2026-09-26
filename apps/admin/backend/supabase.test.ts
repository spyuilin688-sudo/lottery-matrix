import { describe, expect, it, vi } from 'vitest';
import { createSupabaseTransport, getSupabaseConfig } from './supabase';
import { createAdminData } from './admin-data';

const secretReader = (values: Record<string, string>) => ({
  listSecretNames: vi.fn(async () => Object.keys(values)),
  readSecret: vi.fn(async (name: string) => values[name] ?? null),
});

describe('getSupabaseConfig', () => {
  it('reads the two required secrets without listing all secret names for every database call', async () => {
    const reader = secretReader({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' });
    await expect(getSupabaseConfig(reader)).resolves.toEqual({ url: 'https://example.supabase.co', serviceRoleKey: 'key' });
    expect(reader.listSecretNames).not.toHaveBeenCalled();
    expect(reader.readSecret).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a required backend secret is missing', async () => {
    await expect(getSupabaseConfig(secretReader({
      SUPABASE_URL: 'https://example.supabase.co',
    }))).rejects.toMatchObject({
      code: 'CONFIG_MISSING',
      statusCode: 503,
    });
  });

  it('shares overlapping secret reads and reads again on the next request for rotation', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let key = 'first-key';
    const reader = secretReader({});
    reader.readSecret.mockImplementation(async (name: string) => {
      await gate;
      return name === 'SUPABASE_URL' ? 'https://example.supabase.co' : key;
    });
    const first = getSupabaseConfig(reader);
    const overlapping = getSupabaseConfig(reader);
    release();
    expect(await Promise.all([first, overlapping])).toEqual([
      { url: 'https://example.supabase.co', serviceRoleKey: 'first-key' },
      { url: 'https://example.supabase.co', serviceRoleKey: 'first-key' },
    ]);
    expect(reader.readSecret).toHaveBeenCalledTimes(2);
    key = 'rotated-key';
    await expect(getSupabaseConfig(reader)).resolves.toMatchObject({ serviceRoleKey: 'rotated-key' });
    expect(reader.readSecret).toHaveBeenCalledTimes(4);
  });

  it('retries missing configuration after it is restored', async () => {
    let key: string | null = null;
    const reader = secretReader({});
    reader.readSecret.mockImplementation(async name => name === 'SUPABASE_URL' ? 'https://example.supabase.co' : key);
    await expect(getSupabaseConfig(reader)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    key = 'restored-key';
    await expect(getSupabaseConfig(reader)).resolves.toMatchObject({ serviceRoleKey: 'restored-key' });
  });
});

describe('createSupabaseTransport', () => {
  it.each([
    ['PT409', 'ADMIN_REVISION_CONFLICT', 409],
    ['42501', 'PRIVATE_ACTIVATION_OWNER_PROTECTED', 403],
    ['22023', 'INVALID_ADMIN_INPUT', 400],
  ])('forwards only expected owner password change errors %s/%s', async (code, message, status) => {
    const transport = createSupabaseTransport(
      { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
      async () => new Response(JSON.stringify({ code, message }), { status }),
    );
    await expect(transport.supabaseRequest('rpc/admin_update_private_activation_owner_password'))
      .rejects.toMatchObject({ message, statusCode: status });
  });
  it.each([
    ['P0002', 'ACTIVATION_CODE_NOT_FOUND', 500, 404],
    ['42501', 'REDEEMED_ACTIVATION_CODE_DELETE_FORBIDDEN', 403, 403],
    ['42501', 'PRIVATE_ACTIVATION_CODE_FORBIDDEN', 403, 403],
  ])('forwards the exact activation deletion error %s/%s', async (code, message, responseStatus, expectedStatus) => {
    const transport = createSupabaseTransport(
      { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
      async () => new Response(JSON.stringify({ code, message }), { status: responseStatus }),
    );
    await expect(transport.supabaseRequest('rpc/admin_delete_activation_code'))
      .rejects.toMatchObject({ message, statusCode: expectedStatus });
  });

  it('preserves private activation deletion permission denial through the transport and admin service', async () => {
    const transport = createSupabaseTransport(
      { url: 'https://example.invalid', serviceRoleKey: 'test-key' },
      async () => Response.json({ code: '42501', message: 'PRIVATE_ACTIVATION_CODE_FORBIDDEN' }, { status: 403 }),
    );
    await expect(createAdminData(transport).deleteActivationCode('code-1', {
      id: 'admin-1', account: 'other@example.com', role: '超級管理員',
    })).rejects.toMatchObject({ statusCode: 403, message: '沒有刪除隱藏啟動碼權限' });
  });

  it.each([
    ['PT409', 'PAYMENT_ENTITLEMENT_CONFLICT', 409],
    ['42501', 'PAYMENT_REVERSAL_FORBIDDEN', 403],
  ])('forwards the exact reversal error %s/%s to the administrator', async (code, message, status) => {
    const transport = createSupabaseTransport(
      { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
      async () => new Response(JSON.stringify({ code, message }), { status }),
    );
    await expect(transport.supabaseRequest('rpc/admin_record_payment_reversal'))
      .rejects.toMatchObject({ message, statusCode: status });
  });

  it('propagates an exact payment-reversal domain error through the real transport and admin service', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 'P0001',
      message: 'PAYMENT_REVERSAL_CONFLICT',
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));
    const transport = createSupabaseTransport({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'test-key',
    }, fetcher);
    const data = createAdminData(transport);

    await expect(data.recordPaymentReversal(
      'payment-1',
      'refunded',
      '銀行退款已完成',
      { id: 'admin-1', account: 'owner@example.com', name: '管理員' },
    )).rejects.toMatchObject({
      message: 'PAYMENT_REVERSAL_CONFLICT',
      statusCode: 400,
    });
  });

  it.each(['ADMIN_ACTOR_NOT_FOUND', 'PAYMENT_NOT_FOUND'])(
    'propagates the exact P0002/%s reversal domain error returned by PostgREST as HTTP 500',
    async (message) => {
      const transport = createSupabaseTransport(
        { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
        async () => new Response(JSON.stringify({ code: 'P0002', message }), { status: 500 }),
      );

      await expect(transport.supabaseRequest('rpc/admin_record_payment_reversal'))
        .rejects.toMatchObject({ message, statusCode: 400 });
    },
  );

  it.each([
    ['PT409', 'SETTINGS_CONFLICT', 409],
    ['42501', 'FORBIDDEN', 403],
    ['42501', 'ADMIN_BACKEND_REQUIRED', 403],
    ['22023', 'INVALID_REQUEST', 400],
  ])('propagates the exact %s/%s permission-setting domain error', async (code, message, status) => {
    const transport = createSupabaseTransport(
      { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
      async () => new Response(JSON.stringify({ code, message }), { status }),
    );

    await expect(transport.supabaseRequest('rpc/admin_matrix_permission_settings_update'))
      .rejects.toMatchObject({ message, statusCode: status });
  });

  it.each([
    ['rpc/admin_update_subscription_guarded', 'SUBSCRIPTION_CONFLICT'],
    ['rpc/admin_update_subscription_guarded', 'ADMIN_REQUEST_CONFLICT'],
    ['rpc/admin_reset_revenue_baseline_v2', 'ADMIN_REQUEST_CONFLICT'],
  ])('returns an actionable conflict for %s %s', async (path, message) => {
    const transport = createSupabaseTransport(
      { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
      async () => new Response(JSON.stringify({ code: 'PT409', message }), { status: 409 }),
    );
    await expect(transport.supabaseRequest(path)).rejects.toMatchObject({ message, statusCode: 409 });
  });

  it.each([
    ['/rest/v1/rpc/admin_update_subscription', { code: 'P0001', message: 'PAYMENT_REVERSAL_CONFLICT' }],
    ['/rest/v1/rpc/admin_record_payment_reversal', { code: 'P0001', message: 'UNKNOWN_DATABASE_DETAIL' }],
    ['/rest/v1/rpc/admin_record_payment_reversal', { code: 'XX000', message: 'PAYMENT_REVERSAL_CONFLICT' }],
    ['/rest/v1/rpc/admin_record_payment_reversal', { code: 'constructor', message: 'PAYMENT_REVERSAL_CONFLICT' }],
    ['/rest/v1/rpc/admin_record_payment_reversal', { code: 'P0002', message: 'PAYMENT_NOT_FOUND' }],
    ['/rest/v1/rpc/admin_matrix_permission_settings_update', { code: 'PT409', message: 'UNKNOWN_DATABASE_DETAIL' }],
    ['/rest/v1/rpc/matrix_permission_settings', { code: 'PT409', message: 'SETTINGS_CONFLICT' }],
  ])('keeps non-allowlisted database errors redacted for %s', async (path, body) => {
    const transport = createSupabaseTransport(
      { url: 'https://example.supabase.co', serviceRoleKey: 'test-key' },
      async () => new Response(JSON.stringify(body), { status: 400 }),
    );

    const failure = await transport.request(path).catch((error) => error);
    expect(failure).toMatchObject({ code: 'UNAVAILABLE', statusCode: 503 });
    expect(String(failure.message)).not.toContain(body.message);
  });

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
