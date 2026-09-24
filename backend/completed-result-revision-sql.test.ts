import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20260924182100_completed_result_revision.sql', import.meta.url), 'utf8');

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.lottery_draws(lottery text, period text, draw_date date);
    create table private.matrix_draw_read_state(lottery text primary key, revision text not null);
    create table private.matrix_worker_completion(lottery text primary key, generation bigint not null);
    create table private.matrix_analysis_active_versions(
      lottery text, draw_period text, number_order text, analysis_version text, activated_at timestamptz
    );
    insert into public.lottery_draws values ('今彩539','115000230','2026-09-24');
    insert into private.matrix_draw_read_state values ('今彩539','draw-v1');
    insert into private.matrix_worker_completion values ('今彩539',1);
    insert into private.matrix_analysis_active_versions values
      ('今彩539','115000230','sorted','analysis-v1','2026-09-24T01:00:00Z');`);
  await db.exec(migration);
});
afterAll(async () => db.close());

const read = async () => (await db.query<{ version: Record<string, Record<string, unknown>> }>(
  'select public.matrix_public_result_revision() as version',
)).rows[0].version;

it('changes the shared version on a draw correction, analysis write, or active version change', async () => {
  const first = await read();
  expect(Object.keys(first).sort()).toEqual(['今彩539', '六合彩', '大樂透', '天天樂'].sort());
  await db.exec("update private.matrix_draw_read_state set revision = 'draw-v2' where lottery='今彩539'");
  const second = await read();
  expect(second['今彩539']).not.toEqual(first['今彩539']);
  await db.exec("update private.matrix_worker_completion set generation=2 where lottery='今彩539'");
  const third = await read();
  expect(third['今彩539']).not.toEqual(second['今彩539']);
  await db.exec("update private.matrix_analysis_active_versions set analysis_version='analysis-v2' where lottery='今彩539'");
  expect((await read())['今彩539']).not.toEqual(third['今彩539']);
});

it('keeps the public revision RPC callable only by the service role', async () => {
  const { rows } = await db.query<{ anon: boolean; member: boolean; service: boolean }>(`select
    has_function_privilege('anon','public.matrix_public_result_revision()','EXECUTE') as anon,
    has_function_privilege('authenticated','public.matrix_public_result_revision()','EXECUTE') as member,
    has_function_privilege('service_role','public.matrix_public_result_revision()','EXECUTE') as service`);
  expect(rows[0]).toEqual({ anon: false, member: false, service: true });
});
