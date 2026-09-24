// Isolated PostgreSQL: never sends test visits to production.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const migration = (suffix) => {
  const name = readdirSync('supabase/migrations').find((file) => file.endsWith(suffix));
  assert.ok(name, `Missing migration ${suffix}`);
  return readFileSync(`supabase/migrations/${name}`, 'utf8');
};

try {
  await db.exec('create schema private; create schema cron; create role anon; create role authenticated; create role service_role; create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;');
  await db.exec(migration('_matrix_visitor_counts.sql'));
  await db.exec(migration('_secure_visitor_counting.sql'));
  await db.exec(migration('_intro_only_visitor_counting.sql'));

  const visit = (hash, at) => db.query('select private.record_matrix_intro_visit($1,$2::timestamptz)', [hash, at]);
  const count = async (type, day) => Number((await db.query('select visitors from private.matrix_intro_visitor_counts where period_type=$1 and period_start=$2::date', [type, day])).rows[0]?.visitors ?? 0);
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);

  await visit(a, '2026-09-24T15:00:00Z');
  await visit(a, '2026-09-24T15:30:00Z');
  await visit(b, '2026-09-24T15:45:00Z');
  assert.equal(await count('day', '2026-09-24'), 2, 'an intro visitor counts once per Taipei day');
  assert.equal(await count('total', '1970-01-01'), 2);

  await visit(a, '2026-09-24T16:00:00Z');
  assert.equal(await count('day', '2026-09-25'), 1, 'Taipei midnight starts a new day');
  assert.equal(await count('total', '1970-01-01'), 2, 'returning intro visitors are not new cumulative visitors');

  await visit(a, '2026-12-23T14:59:59Z');
  assert.equal(await count('total', '1970-01-01'), 2);
  await visit(a, '2026-12-23T15:00:00Z');
  assert.equal(await count('total', '1970-01-01'), 3, 'the existing 90-day identifier retention applies');
  assert.equal((await db.query("select count(*)::int n from private.matrix_visitor_counts")).rows[0].n, 0, 'intro visits never enter the main-site counters');
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const beforeToday = await count('day', today);

  await db.exec('set role anon');
  await assert.rejects(db.query("select public.record_matrix_intro_visit_edge('203.0.113.7')"), /permission denied/);
  await assert.rejects(db.query('select public.intro_visitor_stats()'), /permission denied/);
  await assert.rejects(db.query('select * from private.matrix_intro_visitor_identifiers'), /permission denied/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query('select public.intro_visitor_stats()'), /permission denied/);

  await db.exec('reset role; set role service_role');
  await db.query("select public.record_matrix_intro_visit_edge('203.0.113.7')");
  await db.query("select public.record_matrix_intro_visit_edge('203.0.113.7')");
  const stats = (await db.query('select public.intro_visitor_stats() result')).rows[0].result;
  assert.equal(stats.todayVisitors, beforeToday + 1);
  assert.equal(stats.totalVisitors, 4);
  assert.deepEqual(Object.keys(stats).sort(), ['todayVisitors', 'totalVisitors']);

  await db.exec('reset role; update private.matrix_intro_visitor_identifiers set created_at=now()-interval \'91 days\'; select private.purge_matrix_visitor_identifiers();');
  assert.equal((await db.query('select count(*)::int n from private.matrix_intro_visitor_identifiers')).rows[0].n, 0);
  assert.equal(await count('total', '1970-01-01'), 4, 'purging identifiers does not delete cumulative counts');
  assert.equal((await db.query('select count(*)::int n from private.matrix_visitor_counts')).rows[0].n, 0);
  console.log('Intro-only visitor isolation, Taipei day, privacy, retention, and service-role access passed.');
} finally {
  await db.close();
}
