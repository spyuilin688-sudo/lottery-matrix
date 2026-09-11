import 'edge-runtime';
import { createClient } from '@supabase/supabase-js';
// @ts-types="web-push-types"
import webpush from 'web-push';
import { createAdminSecurityPushHandler, type SecurityPushJob } from './handler.ts';

function secret(name: string) {
  const value = Deno.env.get(name)?.trim() ?? '';
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function normalizeJob(value: unknown): SecurityPushJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_DISPATCH_RPC_RESULT');
  const row = value as Record<string, unknown>;
  const fields = ['id', 'lease_token', 'subscription_id', 'admin_id', 'group_id', 'category', 'endpoint', 'p256dh', 'auth_key'] as const;
  for (const field of fields) {
    if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error('INVALID_DISPATCH_RPC_RESULT');
  }
  if (!['public_query','admin_login','unauthorized'].includes(String(row.category)) || !Number.isSafeInteger(row.event_count) || Number(row.event_count) < 1 || Number(row.event_count) > 2147483646) throw new Error('INVALID_DISPATCH_RPC_RESULT');
  return {...Object.fromEntries(fields.map(field => [field, row[field]])), event_count:row.event_count} as SecurityPushJob;
}

function booleanResult(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('INVALID_DISPATCH_RPC_RESULT');
  return value;
}

const supabase = createClient(secret('SUPABASE_URL'), secret('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
webpush.setVapidDetails(secret('WEB_PUSH_SUBJECT'), secret('WEB_PUSH_PUBLIC_KEY'), secret('WEB_PUSH_PRIVATE_KEY'));

Deno.serve(createAdminSecurityPushHandler({
  dispatchToken: secret('MATRIX_NOTIFICATION_DISPATCH_TOKEN'),
  async claim() {
    const { data, error } = await supabase.rpc('admin_security_push_claim');
    if (error) throw error;
    if (!Array.isArray(data) || data.length > 10) throw new Error('INVALID_DISPATCH_RPC_RESULT');
    return data.map(normalizeJob);
  },
  async eligible(job) {
    const { data, error } = await supabase.rpc('admin_security_push_eligible', {
      p_id: job.id, p_lease_token: job.lease_token,
    });
    if (error) throw error;
    return booleanResult(data);
  },
  async sendPush(job, payload) {
    await webpush.sendNotification({
      endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth_key },
    }, JSON.stringify(payload), { timeout: 8000, TTL: 300 });
  },
  async finish(job, outcome, disable) {
    const { data, error } = await supabase.rpc('admin_security_push_finish', {
      p_id: job.id, p_lease_token: job.lease_token, p_outcome: outcome, p_disable: disable,
    });
    if (error) throw error;
    return booleanResult(data);
  },
}));
