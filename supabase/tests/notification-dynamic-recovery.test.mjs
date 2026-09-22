import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';

async function currentMigration() {
  const directory = new URL('../migrations/', import.meta.url);
  const names = await readdir(directory);
  const name = names.find(candidate => candidate.endsWith('_notification_dynamic_recovery.sql'));
  assert.ok(name, 'notification dynamic recovery migration is missing');
  return readFile(new URL(name, directory), 'utf8');
}

test('notification recovery uses demand-driven scheduling with an hourly fallback', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema private;
      create schema cron;

      create table public.notification_events(
        id uuid primary key,
        fanout_status text not null,
        next_fanout_at timestamptz,
        processing_started_at timestamptz
      );
      create table public.notification_outbox(
        id uuid primary key,
        member_id uuid,
        status text not null,
        next_attempt_at timestamptz,
        processing_started_at timestamptz,
        processed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create table private.native_push_devices(
        installation_id uuid primary key,
        member_id uuid not null,
        revision uuid not null,
        enabled boolean not null,
        enabled_at timestamptz not null
      );
      create table private.native_push_deliveries(
        id uuid primary key,
        outbox_id uuid not null,
        installation_id uuid not null,
        status text not null,
        attempt_count integer not null default 0,
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
        attempt_count integer not null default 0,
        next_attempt_at timestamptz,
        lease_until timestamptz,
        finished_at timestamptz
      );
      create table public.transfer_requests(id uuid primary key);

      create function private.native_push_eligible(uuid, uuid, uuid)
      returns boolean language sql stable as $$ select true $$;
      create function private.notification_fanout_drain(integer, timestamptz)
      returns jsonb language sql as $ select '{}'::jsonb $;
      create function private.notification_dispatch_http_tick()
      returns bigint language sql as $ select null::bigint $;
      create function private.native_notification_dispatch_http_tick()
      returns bigint language sql as $ select null::bigint $;
      create function private.admin_transfer_push_tick()
      returns bigint language sql as $ select null::bigint $;

      create function public.test_notification_trigger()
      returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger notification_event_publish_after_insert
        after insert on public.notification_events
        for each row execute function public.test_notification_trigger();
      create trigger admin_transfer_push_on_insert
        after insert on public.transfer_requests
        for each row execute function public.test_notification_trigger();

      create table cron.job(
        jobid bigserial primary key,
        jobname text not null unique,
        schedule text not null,
        active boolean not null default true,
        command text not null
      );
      create table cron.job_run_details(
        runid bigserial primary key,
        jobid bigint not null,
        status text,
        start_time timestamptz,
        end_time timestamptz
      );
      create function cron.schedule(p_name text, p_schedule text, p_command text)
      returns bigint language plpgsql as $$
      declare v_id bigint;
      begin
        insert into cron.job(jobname,schedule,active,command)
        values(p_name,p_schedule,true,p_command)
        on conflict(jobname) do update
          set schedule=excluded.schedule,active=true,command=excluded.command
        returning jobid into v_id;
        return v_id;
      end;
      $$;
      create function cron.unschedule(p_name text)
      returns boolean language plpgsql as $$
      declare v_count integer;
      begin
        delete from cron.job where jobname=p_name;
        get diagnostics v_count = row_count;
        return v_count > 0;
      end;
      $$;

      insert into cron.job(jobname,schedule,active,command)
      values(
        'matrix-notification-recovery-5m',
        '*/5 * * * *',
        true,
        'select private.notification_recovery_tick(pg_catalog.now());'
      );
    `);

    await db.exec(await currentMigration());

    const jobs = async () => (await db.query(
      'select jobname,schedule,active,command from cron.job order by jobname',
    )).rows;

    assert.deepEqual(await jobs(), [{
      jobname: 'matrix-notification-recovery-fallback',
      schedule: '7 * * * *',
      active: true,
      command: 'select private.notification_recovery_tick(pg_catalog.now());',
    }]);

    await db.exec(`
      insert into public.notification_outbox(
        id,member_id,status,next_attempt_at,processing_started_at,processed_at,created_at
      ) values(
        '10000000-0000-4000-8000-000000000001',
        null,
        'pending',
        now(),
        null,
        null,
        now()
      );
    `);
    let currentJobs = await jobs();
    assert.equal(currentJobs.length, 2);
    assert.equal(currentJobs[0].jobname, 'matrix-notification-recovery-fallback');
    assert.equal(currentJobs[1].jobname, 'matrix-notification-recovery-next');
    assert.notEqual(currentJobs[1].schedule, '*/5 * * * *');

    await db.exec(`
      update public.notification_outbox
      set status='sent',next_attempt_at=null,processed_at=now()
      where id='10000000-0000-4000-8000-000000000001';
    `);
    assert.deepEqual(await jobs(), [{
      jobname: 'matrix-notification-recovery-fallback',
      schedule: '7 * * * *',
      active: true,
      command: 'select private.notification_recovery_tick(pg_catalog.now());',
    }]);

    await db.exec(`
      update public.notification_outbox
      set status='pending',next_attempt_at=now()+interval '2 minutes',processed_at=null
      where id='10000000-0000-4000-8000-000000000001';
    `);
    currentJobs = await jobs();
    assert.equal(currentJobs.some(job => job.jobname === 'matrix-notification-recovery-next'), true);

    const health = (await db.query(
      'select public.admin_notification_delivery_health() as health',
    )).rows[0].health;
    assert.equal(health.mode, 'event-driven');
    assert.equal(health.event_trigger_enabled, true);
    assert.equal(health.admin_transfer_trigger_enabled, true);
    assert.deepEqual(
      {
        enabled: health.recovery.enabled,
        strategy: health.recovery.strategy,
        schedule: health.recovery.schedule,
        queueTrigger: health.recovery.queue_trigger_enabled,
        dynamic: health.recovery.dynamic_enabled,
      },
      {
        enabled: true,
        strategy: 'dynamic-with-hourly-fallback',
        schedule: '7 * * * *',
        queueTrigger: true,
        dynamic: true,
      },
    );
    assert.equal(typeof health.recovery.next_due_at, 'string');

    await db.exec(`
      update public.notification_outbox
      set status='sent',next_attempt_at=null,processed_at=now()
      where id='10000000-0000-4000-8000-000000000001';
    `);
    await db.exec(`
      insert into public.notification_events(id,fanout_status,next_fanout_at,processing_started_at)
      values('20000000-0000-4000-8000-000000000001','processing',null,now());
      update public.notification_events
      set fanout_status='pending',next_fanout_at=now()+interval '1 minute',processing_started_at=null
      where id='20000000-0000-4000-8000-000000000001';
    `);
    currentJobs = await jobs();
    assert.equal(currentJobs.some(job => job.jobname === 'matrix-notification-recovery-next'), true);

    await db.exec(`
      update public.notification_events
      set fanout_status='complete',next_fanout_at=null,processing_started_at=null
      where id='20000000-0000-4000-8000-000000000001';
      select private.notification_recovery_replan(pg_catalog.now());
    `);
    assert.deepEqual(await jobs(), [{
      jobname: 'matrix-notification-recovery-fallback',
      schedule: '7 * * * *',
      active: true,
      command: 'select private.notification_recovery_tick(pg_catalog.now());',
    }]);

    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const signature of [
        'private.notification_recovery_next_at(timestamp with time zone)',
        'private.notification_recovery_replan(timestamp with time zone)',
        'private.notification_recovery_replan_trigger()',
      ]) {
        const allowed = (await db.query(
          'select has_function_privilege($1,$2,$3) as allowed',
          [role, signature, 'EXECUTE'],
        )).rows[0].allowed;
        assert.equal(allowed, false);
      }
    }
  } finally {
    await db.close();
  }
});
