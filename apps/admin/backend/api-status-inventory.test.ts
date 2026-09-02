import { describe, expect, it } from 'vitest';
import { apiStatusInventory } from './api-status-inventory';

describe('api status inventory', () => {
  it('lists every current AppDeploy, Supabase and Railway endpoint once', () => {
    expect(apiStatusInventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'admin-api', location: 'AppDeploy', endpoint: '/api/_healthcheck' }),
      expect.objectContaining({ id: 'supabase-auth', location: 'Supabase' }),
      expect.objectContaining({ id: 'matrix-status-function', endpoint: '/functions/v1/matrix-status' }),
      expect.objectContaining({ id: 'supabase-rpc-matrix_explore_list', endpoint: '/rest/v1/rpc/matrix_explore_list' }),
      expect.objectContaining({ id: 'supabase-rpc-redeem_activation_code', endpoint: '/rest/v1/rpc/redeem_activation_code' }),
      expect.objectContaining({ id: 'railway-health', location: 'Railway', endpoint: '/health' }),
      expect.objectContaining({ id: 'railway-number-reference', endpoint: '/api/matrix/number-reference' }),
    ]));
    expect(apiStatusInventory).toHaveLength(34);
    expect(new Set(apiStatusInventory.map((item) => item.id)).size).toBe(apiStatusInventory.length);
    expect(apiStatusInventory.every((item) => item.name && item.group && item.endpoint)).toBe(true);
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
      '/rest/v1/rpc/redeem_activation_code',
      '/jobs/refresh',
      '/api/matrix/tongxing',
      '/api/matrix/number-reference',
    ]);

    expect(apiStatusInventory.filter((item) => writeEndpoints.has(item.endpoint)))
      .toEqual(expect.not.arrayContaining([expect.objectContaining({ checkMode: 'live' })]));
  });
});
