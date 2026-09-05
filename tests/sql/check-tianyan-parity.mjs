// Isolated PostgreSQL behavior check. Never connects to production or creates members.
// Run with PGLITE_MODULE_PATH pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create schema private;
    create role anon; create role authenticated; create role service_role;
    create table public.matrix_analysis_runs (
      lottery text, draw_period text, analysis_version text, status text, completed_at timestamptz
    );
    create table public.lottery_draws (lottery text, period text, draw_date date);
    create table private.test_payload (payload jsonb);
    create function private.matrix_result_entitlements() returns jsonb language sql stable
      as $$select jsonb_build_object('canUseTianyan', current_setting('test.allowed', true) = 'true')$$;
    create function private.matrix_artifact_payload(text,text,text,text) returns jsonb language sql stable
      as $$select payload from private.test_payload limit 1$$;
    create function public.matrix_tianyan_list(jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    revoke all on function public.matrix_tianyan_list(jsonb) from public, anon;
    grant execute on function public.matrix_tianyan_list(jsonb) to authenticated,service_role;
    insert into public.matrix_analysis_runs values
      ('今彩539','003','new','complete','2026-09-05'),
      ('今彩539','003','old','complete','2026-09-04'),
      ('今彩539','002','previous','complete','2026-09-03');
    insert into public.lottery_draws values ('今彩539','003','2026-09-05'),('今彩539','002','2026-09-04');
    set test.allowed = 'true';
  `);
  const migration = readdirSync('supabase/migrations').find((name) => name.endsWith('_matrix_tianyan_result_parity.sql'));
  assert.ok(migration);
  await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  const base = { lottery: '今彩539', selectedStreaks: ['準11進12'], sameCode: false };
  const row = (id, numbers, streak = '準11進12', highest = 11) => ({
    id, predictionNumbers: numbers, consecutive: streak, highestStreak: highest,
    predictionDistance: 1, lockedPosition: 1,
  });
  const payload = { items: [row('b',['14','27']), row('a',['14','27']), row('c',['14','35']), row('d',['02','03'],'準15進16',15)] };
  await db.query('insert into private.test_payload values ($1::jsonb)', [JSON.stringify(payload)]);
  const call = async (options = {}) => (await db.query('select public.matrix_tianyan_list($1::jsonb) as result', [JSON.stringify({ ...base, ...options })])).rows[0].result;
  const all = await call();
  assert.equal(all.total,3);
  assert.deepEqual(all.items.map((r)=>r.id),['a','b','c']);
  assert.deepEqual(all.duplicateStats,[{number:'14',count:3},{number:'27',count:2},{number:'35',count:1}]);
  assert.equal(all.analysisVersion,'new');
  const same = await call({sameCode:true});
  assert.deepEqual(same.items.map((r)=>r.id),['a','b']);
  assert.deepEqual(same.duplicateStats,[{number:'14',count:2},{number:'27',count:2}]);
  const selected = await call({predictionNumber:'35'});
  assert.deepEqual(selected.items.map((r)=>r.id),['c']);
  assert.deepEqual(selected.duplicateStats,all.duplicateStats);
  assert.equal((await call({sameCode:true,predictionNumber:'35'})).total,0);
  assert.equal((await call({exploreDateOffset:1})).drawPeriod,'002');
  const empty = await call({selectedStreaks:[]});
  assert.deepEqual([empty.items,empty.duplicateStats,empty.total],[[],[],0]);
  await assert.rejects(call({predictionNumber:'00'}),/INVALID_REQUEST/);
  await assert.rejects(call({exploreDateOffset:3}),/INVALID_REQUEST/);
  await db.exec("set test.allowed = 'false'");
  await assert.rejects(call(),/FORBIDDEN/);
  await db.exec("set test.allowed = 'true'");
  const many = Array.from({length:22},(_,i)=>row(String(i),[String(i+1).padStart(2,'0')]));
  await db.query('update private.test_payload set payload=$1::jsonb',[JSON.stringify({items:many})]);
  assert.deepEqual((await call()).duplicateStats.map((x)=>x.number),Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')));
  const acl = (await db.query(`select has_function_privilege('anon','public.matrix_tianyan_list(jsonb)','execute') as anon,
    has_function_privilege('authenticated','public.matrix_tianyan_list(jsonb)','execute') as authenticated,
    has_function_privilege('service_role','public.matrix_tianyan_list(jsonb)','execute') as service_role`)).rows[0];
  assert.deepEqual(acl,{anon:false,authenticated:true,service_role:true});
  console.log('Tianyan SQL: 17 behavior assertions passed in isolated PostgreSQL');
} finally {
  await db.close();
}
