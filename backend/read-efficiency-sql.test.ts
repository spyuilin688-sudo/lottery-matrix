import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create table lottery_draws(lottery text, period text, draw_date date, numbers jsonb, sorted_numbers jsonb, draw_order_numbers jsonb, result_status text);
    create table matrix_analysis_artifacts(lottery text, draw_period text, kind text, analysis_version text, compact_payload jsonb);
    create function private.matrix_analysis_read_period(text,text,integer) returns text language sql as $$ select coalesce($2,'115000200') $$;
    create function private.matrix_analysis_order_version(text,text,text,text) returns text language sql as $$ select 'v1'::text $$;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create table auth.identities(id uuid primary key, user_id uuid, provider text, provider_id text, identity_data jsonb, created_at timestamptz);
    grant select on lottery_draws to service_role;
    insert into lottery_draws values
      ('今彩539','115000198','2026-09-01','[1,2,3,4,5]',null,null,'confirmed'),
      ('今彩539','115000199','2026-09-02','[2,3,4,5,6]',null,null,'confirmed'),
      ('天天樂','115000198','2026-09-01','[9,8,7,6,5]',null,null,'confirmed'),
      ('今彩539','99000123','2010-01-01','[1,2,3,4,5]',null,null,'confirmed'),
      ('今彩539','099000123','2010-01-01','[1,2,3,4,5]','["01","02","03","04","05"]',null,'confirmed');
    insert into matrix_analysis_artifacts values ('今彩539','115000200','status','v1',
      '{"lottery":"今彩539","drawPeriod":"115000200","summary":{"status":"ACTIVE","count":1},"cards":[{"roads":[1,2,3]}],"counts":{"ACTIVE":1}}');
    insert into auth.users values ('00000000-0000-0000-0000-000000000001','{"full_name":"會員甲","private_field":"hidden"}'),
      ('00000000-0000-0000-0000-000000000002','{"full_name":"別的會員"}');
    insert into auth.identities values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
      'google','google-1','{"sub":"google-1","email":"hidden@example.test"}',now());`);
  for (const name of ['20260920105819_optimize_status_summary_reads.sql','20260920105823_read_validation_draw_periods.sql','20260920105827_admin_member_auth_profiles.sql']) {
    await db.exec(migration(name));
  }
});
afterAll(async () => db.close());
async function readPeriods(lottery: string, periods: unknown) {
  const { rows } = await db.query<{ result: { items?: Array<Record<string, unknown>>; error?: string } }>('select matrix_draw_periods($1,$2) as result', [lottery, periods]);
  return rows[0].result;
}
it('returns identical stored summary/version without transferring cards, counts or roads', async () => {
  const read = async (summaryOnly: boolean) => (await db.query<{ result: { payload: Record<string, unknown>; analysisVersion: string } }>(
    'select matrix_status_compact_get($1) as result', [JSON.stringify({ lottery: '今彩539', summaryOnly })])).rows[0].result;
  const full = await read(false);
  const summary = await read(true);
  expect(summary.analysisVersion).toBe(full.analysisVersion);
  expect(summary.payload).toEqual({ lottery: '今彩539', drawPeriod: '115000200', summary: full.payload.summary });
  expect(full.payload.cards).toBeDefined();
  expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(full).length);
});
it('returns only requested periods, resolves display and historical aliases, and preserves lottery scope', async () => {
  const result = await readPeriods('今彩539', ['115198', '099123', '99000123', '999999']);
  expect(result.items?.map(row => row.period)).toEqual(['115000198', '099000123']);
  expect((await readPeriods('天天樂', ['115000198'])).items?.[0].numbers).toEqual([9,8,7,6,5]);
  expect((await readPeriods('今彩539', [])).items).toEqual([]);
});
it('rejects alias conflicts rather than selecting one incorrect version', async () => {
  await db.exec(`update lottery_draws set numbers='[9,2,3,4,5]' where period='99000123'`);
  expect(await readPeriods('今彩539', ['099123'])).toEqual({ error: 'DRAW_HISTORY_CONFLICT' });
});
it('rejects invalid or oversized period lookups', async () => {
  for (const periods of [null, ['invalid'], [null], Array(501).fill('115198')]) {
    await expect(readPeriods('今彩539', periods)).rejects.toMatchObject({ code: '22023' });
  }
});
it('returns only requested auth profiles and only display identity fields', async () => {
  const { rows } = await db.query<{ result: unknown[] }>('select admin_member_auth_profiles($1) as result', [['00000000-0000-0000-0000-000000000001']]);
  expect(rows[0].result).toHaveLength(1);
  expect(rows[0].result[0]).toMatchObject({ user_metadata: { full_name: '會員甲' }, identities: [{ provider: 'google', provider_id: 'google-1' }] });
  expect(JSON.stringify(rows)).not.toContain('hidden');
  await expect(db.query('select admin_member_auth_profiles($1)', [Array(101).fill('00000000-0000-0000-0000-000000000001')])).rejects.toMatchObject({ code: '22023' });
});
it('grants RPC access only to service_role', async () => {
  for (const signature of ['matrix_status_compact_get(jsonb)','matrix_draw_periods(text,text[])','admin_member_auth_profiles(uuid[])']) {
    const { rows } = await db.query<{ anon: boolean; member: boolean; service: boolean }>(`select
      has_function_privilege('anon',$1,'EXECUTE') as anon,
      has_function_privilege('authenticated',$1,'EXECUTE') as member,
      has_function_privilege('service_role',$1,'EXECUTE') as service`, [signature]);
    expect(rows[0]).toEqual({ anon: false, member: false, service: true });
  }
  await db.exec('set role service_role');
  try { expect((await readPeriods('今彩539',['115198'])).items).toHaveLength(1); }
  finally { await db.exec('reset role'); }
});
