import { vi } from 'vitest';
import { createNativePushHandler } from './handler.ts';

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

const DISPATCH_TOKEN = 'dispatch-token';
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'lottery-matrix-app',
  client_email: 'matrix@lottery-matrix-app.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----',
});
const ENV = {
  MATRIX_NOTIFICATION_DISPATCH_TOKEN: DISPATCH_TOKEN,
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  FCM_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
};

function request(token = DISPATCH_TOKEN) {
  return new Request('https://project.supabase.co/functions/v1/native-notification-dispatch', {
    method: 'POST',
    headers: { 'x-matrix-dispatch-token': token },
    body: '{}',
  });
}

function fakeCrypto() {
  return {
    subtle: {
      importKey: vi.fn(async () => ({} as CryptoKey)),
      sign: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer),
    },
  } as unknown as Crypto;
}

Deno.test('native dispatcher returns before FCM OAuth when queue claim is empty', async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/rest/v1/rpc/native_notification_claim')) {
      return Response.json([]);
    }
    throw new Error(`unexpected network call: ${url}`);
  }) as typeof fetch;

  const handler = createNativePushHandler({
    env: key => ENV[key as keyof typeof ENV],
    fetch: fetcher,
    crypto: fakeCrypto(),
  });

  const response = await handler(request());

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    claimed: 0,
    sent: 0,
    retry: 0,
    failed: 0,
    unregistered: 0,
    canceled: 0,
    stale: 0,
    errors: 0,
  });
  assertEquals(calls, ['https://project.supabase.co/rest/v1/rpc/native_notification_claim']);
});

Deno.test('native dispatcher claims before OAuth and still sends claimed work', async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/rest/v1/rpc/native_notification_claim')) {
      return Response.json([{ delivery_id: 'delivery-1', claim_id: 'claim-1' }]);
    }
    if (url.endsWith('/rest/v1/rpc/native_notification_prepare')) {
      return Response.json({
        token: 'device-token',
        notification_payload: { title: 'title', body: 'body', url: '/', tag: 'tag-1' },
      });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'oauth-token', expires_in: 3600 });
    }
    if (url === 'https://fcm.googleapis.com/v1/projects/lottery-matrix-app/messages:send') {
      return Response.json({ name: 'message-1' });
    }
    if (url.endsWith('/rest/v1/rpc/native_notification_finalize')) {
      return Response.json({ finalized: true });
    }
    throw new Error(`unexpected network call: ${url}`);
  }) as typeof fetch;

  const handler = createNativePushHandler({
    env: key => ENV[key as keyof typeof ENV],
    fetch: fetcher,
    crypto: fakeCrypto(),
  });

  const response = await handler(request());

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    claimed: 1,
    sent: 1,
    retry: 0,
    failed: 0,
    unregistered: 0,
    canceled: 0,
    stale: 0,
    errors: 0,
  });
  assertEquals(calls[0], 'https://project.supabase.co/rest/v1/rpc/native_notification_claim');
  assertEquals(calls[1], 'https://oauth2.googleapis.com/token');
});
