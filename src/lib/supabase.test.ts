import { describe, expect, it } from 'vitest';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';

describe('production Supabase configuration', () => {
  it('keeps the configured project available when build-time overrides are absent', () => {
    expect(hasSupabaseConfig()).toBe(true);
    const client = getSupabaseClient() as unknown as { supabaseKey: string; supabaseUrl: string };
    expect(client.supabaseUrl).toBe('https://wcimzbbapfrdotjsfyxa.supabase.co');
    expect(client.supabaseKey).toBe('sb_publishable_sJuiSZhS6bCOza_RGTMVPg_JFiVv0F8');
  });
});
