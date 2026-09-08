import { describe, expect, it } from 'vitest';
import { apiStatusInventory } from './api-status-inventory';

describe('api status inventory', () => {
  it('lists every current AppDeploy, Supabase, GitHub and Railway endpoint once', () => {
    expect(apiStatusInventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'admin-api', location: 'AppDeploy', endpoint: '/api/_healthcheck' }),
      expect.objectContaining({ id: 'appdeploy-watchdog-heartbeat', location: 'AppDeploy' }),
      expect.objectContaining({ id: 'supabase-auth', location: 'Supabase' }),
      expect.objectContaining({ id: 'matrix-status-function', endpoint: '/functions/v1/matrix-status' }),
      expect.objectContaining({ id: 'supabase-rpc-matrix_explore_list', endpoint: '/rest/v1/rpc/matrix_explore_list' }),
      expect.objectContaining({ id: 'supabase-rpc-redeem_activation_code', endpoint: '/rest/v1/rpc/redeem_activation_code' }),
      expect.objectContaining({
        id: 'github-fantasy5-workflow',
        location: 'GitHub',
        endpoint: '/repos/spyuilin688-sudo/lottery-matrix/actions/workflows/fantasy5-crawler.yml',
      }),
      expect.objectContaining({ id: 'railway-health', location: 'Railway', endpoint: '/health' }),
      expect.objectContaining({ id: 'railway-jobs-recover', endpoint: '/jobs/recover', checkMode: 'service' }),
      expect.objectContaining({ id: 'railway-number-reference', endpoint: '/api/matrix/number-reference' }),
    ]));
    expect(apiStatusInventory).toHaveLength(58);
    expect(new Set(apiStatusInventory.map((item) => item.id)).size).toBe(apiStatusInventory.length);
    expect(apiStatusInventory.every((item) => item.name && item.group && item.endpoint)).toBe(true);
  });

  it('covers the monitored Edge Functions including admin transfer push', () => {
    expect(apiStatusInventory
      .filter((item) => item.endpoint.startsWith('/functions/v1/'))
      .map((item) => item.endpoint))
      .toEqual([
        '/functions/v1/matrix-status',
        '/functions/v1/notification-ingest',
        '/functions/v1/notification-dispatch',
        '/functions/v1/notification-pilio',
        '/functions/v1/send-test-push',
        '/functions/v1/admin-transfer-push',
        '/functions/v1/line-logout',
      ]);
  });

  it('covers watchdog and notification server RPCs as OpenAPI presence checks', () => {
    const rpcNames = [
      'member_referral_summary',
      'member_referral_submit',
      'member_line_pwa_diagnostics_submit',
      'record_matrix_visit',
      'claim_matrix_watchdog_lease',
      'release_matrix_watchdog_lease',
      'begin_matrix_watchdog_recovery',
      'renew_matrix_watchdog_recovery',
      'finish_matrix_watchdog_recovery',
      'notification_dispatch_claim',
      'notification_dispatch_mark_failed',
      'notification_dispatch_mark_retry',
      'notification_dispatch_mark_sent',
      'notification_dispatch_mark_skipped',
      'notification_event_enqueue_server',
    ];

    expect(rpcNames.map((rpc) => apiStatusInventory.find((item) =>
      item.endpoint === `/rest/v1/rpc/${rpc}`)))
      .toEqual(rpcNames.map((rpc) => expect.objectContaining({
        id: `supabase-rpc-${rpc}`,
        checkMode: 'registry',
      })));
  });

  it('describes the deployed ten-minute watchdog schedule', () => {
    expect(apiStatusInventory.find((item) => item.id === 'appdeploy-watchdog-heartbeat')?.description).toContain('每 10 分鐘');
  });

  it('never live-probes write endpoints', () => {
    const writeEndpoints = new Set([
      '/rest/v1/rpc/matrix_custom_status_save',
      '/rest/v1/rpc/matrix_custom_status_reset',
      '/rest/v1/rpc/member_notification_settings_save',
      '/rest/v1/rpc/member_transfer_request_submit',
      '/rest/v1/rpc/member_push_subscription_save',
      '/rest/v1/rpc/member_push_subscription_disable',
      '/rest/v1/rpc/member_online_start',
      '/rest/v1/rpc/member_online_end',
      '/rest/v1/rpc/member_referral_submit',
      '/rest/v1/rpc/member_line_pwa_diagnostics_submit',
      '/rest/v1/rpc/record_matrix_visit',
      '/rest/v1/rpc/redeem_activation_code',
      '/rest/v1/rpc/claim_matrix_watchdog_lease',
      '/rest/v1/rpc/release_matrix_watchdog_lease',
      '/rest/v1/rpc/begin_matrix_watchdog_recovery',
      '/rest/v1/rpc/renew_matrix_watchdog_recovery',
      '/rest/v1/rpc/finish_matrix_watchdog_recovery',
      '/rest/v1/rpc/notification_dispatch_claim',
      '/rest/v1/rpc/notification_dispatch_mark_failed',
      '/rest/v1/rpc/notification_dispatch_mark_retry',
      '/rest/v1/rpc/notification_dispatch_mark_sent',
      '/rest/v1/rpc/notification_dispatch_mark_skipped',
      '/rest/v1/rpc/notification_event_enqueue_server',
      '/jobs/refresh',
      '/jobs/recover',
      '/api/matrix/tongxing',
      '/api/matrix/number-reference',
    ]);

    expect(apiStatusInventory.filter((item) => writeEndpoints.has(item.endpoint)))
      .toEqual(expect.not.arrayContaining([expect.objectContaining({ checkMode: 'live' })]));
  });
});
