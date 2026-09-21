import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';

test('event-driven notification health is read-only, aggregate-only and follows the recovery architecture', async () => {
  const db = new PGlite();
  const sql = await readFile(
    new URL('../migrations/20260921233500_admin_notification_delivery_health.sql', import.meta.url),
    'utf8',
  );
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema private;
      create schema cron;

      create table public.notification_events(id uuid primary key);
      create table public.notification_outbox(
        id uuid primary key,
        status text not null,
        next_attempt_at timestamptz,
        processing_started_at timestamptz,
        processed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create table private.native_push_devices(
        installation_id uuid primary key,
        token text not null,
        enabled boolean not null
      );
      create table private.native_push_deliveries(
        id uuid primary key,
        status text not null,
        next_attempt_at timestamptz,
        lease_until timestamptz,
        finished_at timestamptz
      );
      create table public.admin_push_subscriptions(
        id uuid primary key,
        endpoint text not null,
        enabled boolean not null
      );
      create table public.admin_transfer_push_jobs(
        id uuid primary key,
        status text not null,
        next_attempt_at timestamptz,
        lease_until timestamptz,
        finished_at timestamptz
      );
      create table public.transfer_requests(id uuid primary key);

      create function public.test_notification_trigger()
      returns trigger language plpgsql as $$ begin return null; end $$;
      create trigger notification_event_publish_after_insert
        after insert on public.notification_events
        for each row execute function public.test_notification_trigger();
      create trigger admin_transfer_push_on_insert
        after insert on public.transfer_requests
        for each row execute function public.test_notification_trigger();

      create table cron.job(
        jobid bigint primary key,
        jobname text,
        schedule text,
        active boolean,
        command text
      );
      create table cron.job_run_details(
        runid bigint primary key,
        jobid bigint,
        status text,
        start_time timestamptz,
        end_time timestamptz
      );

      insert into cron.job values
        (45, 'matrix-notification-recovery-5m', '*/5 * * * *', true, 'SECRET_COMMAND');
      insert into cron.job_run_details values
        (1, 45, 'succeeded', now() - interval '1 minute', now() - interval '59 seconds');

      insert into private.native_push_devices values
        ('f17ea001-0000-4000-8000-000000000001', 'DEVICE_TOKEN_MUST_NOT_LEAK', true);
      insert into public.admin_push_subscriptions values
        ('f17ea001-0000-4000-8000-000000000002', 'https://SECRET_ENDPOINT', true);

      insert into public.notification_outbox values
        ('f17ea001-0000-4000-8000-000000000003', 'sent', null, null, now()-interval '1 hour', now()-interval '1 hour'),
        ('f17ea001-0000-4000-8000-000000000004', 'pending', now()-interval '6 minutes', null, null, now()-interval '7 minutes');
      insert into private.native_push_deliveries values
        ('f17ea001-0000-4000-8000-000000000005', 'sent', null, null, now()-interval '2 hours'),
        ('f17ea001-0000-4000-8000-000000000006', 'pending', now()-interval '6 minutes', null, null);
      insert into public.admin_transfer_push_jobs values
        ('f17ea001-0000-4000-8000-000000000007', 'sent', now(), null, now()-interval '3 hours'),
        ('f17ea001-0000-4000-8000-000000000008', 'sending', now(), now()-interval '6 minutes', null);
    `);
    await db.exec(sql);

    const health = (await db.query('select public.admin_notification_delivery_health() as health')).rows[0].health;
    assert.equal(health.mode, 'event-driven');
    assert.equal(health.event_trigger_enabled, true);
    assert.equal(health.admin_transfer_trigger_enabled, true);
    assert.deepEqual(
      {
        enabled: health.recovery.enabled,
        schedule: health.recovery.schedule,
        status: health.recovery.last_status,
      },
      { enabled: true, schedule: '*/5 * * * *', status: 'succeeded' },
    );
    assert.deepEqual(
      { pending: health.web.pending, overdue: health.web.overdue, sent: health.web.sent_24h },
      { pending: 1, overdue: 1, sent: 1 },
    );
    assert.deepEqual(
      {
        devices: health.native.enabled_devices,
        pending: health.native.pending,
        overdue: health.native.overdue,
        sent: health.native.sent_24h,
      },
      { devices: 1, pending: 1, overdue: 1, sent: 1 },
    );
    assert.deepEqual(
      {
        subscriptions: health.admin.enabled_subscriptions,
        sending: health.admin.sending,
        overdue: health.admin.overdue,
        sent: health.admin.sent_24h,
      },
      { subscriptions: 1, sending: 1, overdue: 1, sent: 1 },
    );
    assert.doesNotMatch(
      JSON.stringify(health),
      /MUST_NOT_LEAK|SECRET|f17ea001|command|token|endpoint/i,
    );

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query('select public.admin_notification_delivery_health()'),
        error => error.code === '42501',
      );
      await db.exec('reset role');
    }

    const privilege = (await db.query(`
      select p.provolatile, p.prosecdef, p.proconfig,
        pg_catalog.has_function_privilege(
          'service_role',
          'public.admin_notification_delivery_health()',
          'execute'
        ) as service_allowed,
        exists(
          select 1 from pg_catalog.aclexplode(p.proacl) acl
          where acl.grantee=0 and acl.privilege_type='EXECUTE'
        ) as public_allowed
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='admin_notification_delivery_health'
    `)).rows[0];
    assert.deepEqual(privilege, {
      provolatile: 's',
      prosecdef: true,
      proconfig: ['search_path=""'],
      service_allowed: true,
      public_allowed: false,
    });

    const before = (await db.query('select count(*)::int n from public.notification_outbox')).rows[0].n;
    await db.exec('begin read only; set local role service_role;');
    await db.query('select public.admin_notification_delivery_health()');
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from public.notification_outbox')).rows[0].n, before);
  } finally {
    await db.close();
  }
});
