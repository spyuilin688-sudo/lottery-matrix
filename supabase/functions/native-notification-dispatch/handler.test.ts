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
  private_key: '-----BEGIN PRIVATE KEY-----\ninvalid-test-key\n-----END PRIVATE KEY-----',
});

function request(token = DISPATCH_TOKEN) {
  return new Request('https://project.supabase.co/functions/v1/native-notification-dispatch', {
    method: 'POST',
    headers: { 'x-matrix-dispatch-token': token },
    body: '{}',
  });
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
    env(key) {
      return {
        MATRIX_NOTIFICATION_DISPATCH_TOKEN: DISPATCH_TOKEN,
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        FCM_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
      }[key];
    },
    fetch: fetcher,
    crypto,
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
