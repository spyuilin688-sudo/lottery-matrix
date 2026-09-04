# Automatic Notification Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved automatic notification pipeline so trusted Railway/Cron/admin events become idempotent Supabase events, member-filtered outbox work, Web Push deliveries, retries, and delivery logs without changing the existing PWA notification UI.

**Architecture:** Supabase owns `notification_events`, `notification_outbox`, fan-out, retry/recovery, time-based events, and dispatch scheduling. Railway only emits trusted business events after durable completion points, and the admin backend only emits validated `system_notice` events. Existing test push, subscriptions, notification settings, and Service Worker behavior stay intact; production and test push share one server-side Web Push delivery primitive.

**Tech Stack:** PostgreSQL 17 / Supabase SQL + pgTAP, Supabase Edge Functions (Deno/TypeScript), `@supabase/supabase-js`, `web-push`, Python 3 + `httpx` + pytest, AppDeploy admin backend TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-03-notification-dispatch-design.md` (approved by `docs/superpowers/specs/2026-09-03-notification-dispatch-approval.md`)

## Global Constraints

- Implementation baseline is `main` commit `364f7e8d955920a3b9503feff842ee6a03a73613`.
- Do not modify `src/NotificationsPagePatched.tsx`, `src/member-api.ts`, `src/push-subscription.ts`, or `public/push-service-worker.js`.
- Do not modify activation-code or referral-code behavior.
- Do not create or mutate production member, activation-code, referral, payment, or notification data for E2E without explicit user authorization.
- `notification_events.event_key` is globally unique.
- `notification_outbox(event_id, member_id, channel)` is unique.
- Railway emits events only; it never queries members, sends Web Push, retries Web Push, or kicks the dispatcher.
- Supabase Cron performs fan-out/recovery and invokes the dispatcher every minute.
- First automatic event set is `lottery_result`, `matrix_status`, `matrix_card`, `bet_reminder`, `membership_expiry`, and `system_notice`.
- Do not auto-trigger `win` or `collision` until their business rules are separately approved.
- Web Push itself is at-least-once; do not claim strict exactly-once delivery.
- `matrix_card` follows the current on-demand card architecture: the card is considered ready after the latest draw is durably stored and enough history exists for `card_layout(lottery)["column_rows"]`; do not add a new card-storage subsystem.
- `membership_expiry` uses existing `public.members.plan_expires_at`; lifetime members are excluded.
- All lottery reminder clock comparisons use `Asia/Taipei`.
- `system_notice` categories are exactly `維護` or `更新`; title length is 1–80 Unicode code points and body length is 1–240 Unicode code points; URL remains `/`.
- Formal system dispatch writes `push_delivery_logs.admin_account = 'system:notification-dispatch'`; manual test push keeps the real admin account.
- `notification-ingest` and `notification-dispatch` use dedicated custom server tokens and MUST be deployed with Supabase gateway JWT verification disabled; each handler performs its own constant-time token validation. `send-test-push` keeps its existing service-role bearer/JWT path.
- `notification_payload.tag` remains part of the durable outbox snapshot, but the current `public/push-service-worker.js` does not pass `tag` into `showNotification`; do not modify the Service Worker in this feature and do not claim browser-level tag deduplication.
- Production notification emission remains disabled until the required server secrets are configured and the user explicitly authorizes controlled production E2E.

---

## File Structure

### New files

- `supabase/migrations/20260903133000_notification_dispatch_schema.sql`
  - Tables, checks, indexes, RLS/grants, `private.notification_event_enqueue`, its service-role-only public RPC wrapper, and base server RPC contracts.
- `supabase/migrations/20260903133500_notification_dispatch_pipeline.sql`
  - Event validation helpers, renderer/filter helpers, fan-out/recovery, time-event generation, retry scheduling, and Cron SQL entrypoints.
- `supabase/migrations/20260903133700_notification_dispatch_rpc.sql`
  - Service-role-only dispatcher claim/finalizer RPCs and stale outbox recovery.
- `supabase/migrations/20260903133800_notification_dispatch_time_events.sql`
  - Bet/expiry time-event generation and the database notification pipeline tick.
- `supabase/migrations/20260903134000_notification_dispatch_cron.sql`
  - Enables `pg_cron`/`pg_net`, defines the HTTP dispatcher tick using Vault secrets, and schedules the two one-minute jobs.
- `supabase/tests/database/notification_dispatch.test.sql`
  - pgTAP coverage for schema, permissions, deduplication, filters, fan-out, time events, claim/recovery, and retry state.
- `supabase/functions/_shared/web-push-delivery.ts`
  - Shared subscription delivery primitive used by test push and formal dispatcher.
- `supabase/functions/_shared/web-push-delivery.test.ts`
  - Shared delivery primitive tests.
- `supabase/functions/notification-ingest/handler.ts`
  - Request authentication and strict event schema validation.
- `supabase/functions/notification-ingest/handler.test.ts`
  - Ingest auth/schema/idempotency contract tests with injected enqueue dependency.
- `supabase/functions/notification-ingest/index.ts`
  - Supabase client wiring and Edge Function entrypoint.
- `supabase/functions/notification-ingest/deno.json`
  - Edge Function import map/dependencies.
- `supabase/functions/notification-dispatch/handler.ts`
  - Trusted dispatcher loop and outbox outcome logic.
- `supabase/functions/notification-dispatch/handler.test.ts`
  - Retry/skip/sent/expired-endpoint dispatcher tests.
- `supabase/functions/notification-dispatch/index.ts`
  - Supabase RPC + shared Web Push wiring.
- `supabase/functions/notification-dispatch/deno.json`
  - Edge Function import map/dependencies.
- `services/matrix-api/app/services/notification_events.py`
  - Railway event payload construction, validation, and ingest HTTP client.
- `services/matrix-api/tests/test_notification_events.py`
  - Pure unit tests for keys/payloads and HTTP error behavior.
- `apps/admin/backend/notification-events.ts`
  - Admin system-notice validator and ingest client.
- `apps/admin/backend/notification-events.test.ts`
  - Admin validation/auth-client behavior tests.
- `docs/superpowers/handoffs/2026-09-03-notification-dispatch-verification.md`
  - Final implementation/verification matrix; factual results only.

### Modified files

- `supabase/functions/send-test-push/handler.ts`
  - Consume shared delivery result types instead of owning expiration/failure classification.
- `supabase/functions/send-test-push/index.ts`
  - Wire the shared delivery primitive while preserving current service-role test-push API.
- `supabase/functions/send-test-push/handler.test.ts`
  - Keep existing behavior assertions after refactor.
- `services/matrix-api/app/settings.py`
  - Add optional notification ingest URL/token configuration.
- `services/matrix-api/app/worker.py`
  - Emit result/card/status events at durable readiness points and retry idempotently on completed runs.
- `services/matrix-api/tests/test_worker.py`
  - Verify event timing, no premature status event, idempotent retry path, and no event when integration is disabled.
- `apps/admin/backend/index.ts`
  - Add protected `POST /api/system-notices`.
- `apps/admin/backend/index-wiring.test.ts`
  - Verify route guards and wiring.

---

### Task 1: Create event/outbox schema and trusted enqueue core

**Files:**
- Create: `supabase/migrations/20260903133000_notification_dispatch_schema.sql`
- Create: `supabase/tests/database/notification_dispatch.test.sql`

**Interfaces:**
- Produces: `private.notification_event_enqueue(p_event_key text, p_event_type text, p_source text, p_occurred_at timestamptz, p_payload jsonb) returns jsonb` as the single insert/dedupe core.
- Produces: `public.notification_event_enqueue_server(p_event_key text, p_event_type text, p_source text, p_occurred_at timestamptz, p_payload jsonb) returns jsonb` as the service-role-only PostgREST/Edge wrapper.
- Produces: `public.notification_events` and `public.notification_outbox`.
- Consumes: existing `public.members` and `private.default_member_notification_settings()`.

- [ ] **Step 1: Write the pgTAP structure/security tests first**

Add the pgTAP contract for the two tables, enqueue function, constraints, and grants. These assertions are expected to be red until the migration exists:

```sql
begin;

select plan(20);

select has_table('public', 'notification_events');
select has_table('public', 'notification_outbox');
select has_function(
  'private',
  'notification_event_enqueue',
  array['text','text','text','timestamp with time zone','jsonb']
);
select has_function(
  'public',
  'notification_event_enqueue_server',
  array['text','text','text','timestamp with time zone','jsonb']
);

select col_is_pk('public', 'notification_events', 'id');
select col_is_pk('public', 'notification_outbox', 'id');
select has_index('public', 'notification_events', 'notification_events_event_key_key');
select has_index('public', 'notification_outbox', 'notification_outbox_event_id_member_id_channel_key');

set local role anon;
select throws_ok(
  $$insert into public.notification_events(event_key,event_type,source,payload,occurred_at)
    values ('forged','lottery_result','railway','{}',now())$$,
  '42501',
  null,
  'anon cannot forge notification events'
);
reset role;

set local role authenticated;
select throws_ok(
  $$insert into public.notification_outbox(event_id,member_id,channel,notification_payload)
    values (gen_random_uuid(),gen_random_uuid(),'web_push','{}')$$,
  '42501',
  null,
  'authenticated cannot forge notification outbox work'
);
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Prepare the local Supabase test harness and prove the new contract is red**

The repository currently has no committed `supabase/config.toml`. Prepare a local-only config before the first pgTAP run:

```bash
test -f supabase/config.toml || npx supabase init
npx supabase start
npx supabase test db
```

Expected: FAIL on missing `notification_events`, `notification_outbox`, and `notification_event_enqueue`.

Do not include a machine-generated local `supabase/config.toml` in the feature commit unless the repository owner separately approves making local Supabase configuration part of source control.

- [ ] **Step 3: Implement the schema and checks**

Create `notification_events` and `notification_outbox` with explicit checks:

```sql
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (event_type in (
    'lottery_result','matrix_status','matrix_card',
    'bet_reminder','membership_expiry','system_notice'
  )),
  source text not null check (source in ('railway','cron','admin')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  fanout_status text not null default 'pending'
    check (fanout_status in ('pending','processing','complete','failed')),
  fanout_attempt_count integer not null default 0 check (fanout_attempt_count >= 0),
  next_fanout_at timestamptz,
  processing_started_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  channel text not null default 'web_push' check (channel = 'web_push'),
  notification_payload jsonb not null check (jsonb_typeof(notification_payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  processing_started_at timestamptz,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id, channel)
);
```

Add indexes for due fan-out and due outbox claims:

```sql
create index notification_events_due_idx
  on public.notification_events (fanout_status, next_fanout_at, created_at);

create index notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at, created_at);
```

Enable RLS, revoke table access from `public, anon, authenticated`, and grant table access only to `service_role`.

- [ ] **Step 4: Implement the single enqueue core**

Use a fixed `search_path`, deterministic insert, and duplicate-as-success behavior:

```sql
create or replace function private.notification_event_enqueue(
  p_event_key text,
  p_event_type text,
  p_source text,
  p_occurred_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.notification_events%rowtype;
  v_created boolean := false;
begin
  if nullif(btrim(p_event_key), '') is null
     or p_event_type not in (
       'lottery_result','matrix_status','matrix_card',
       'bet_reminder','membership_expiry','system_notice'
     )
     or p_source not in ('railway','cron','admin')
     or p_occurred_at is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_EVENT';
  end if;

  insert into public.notification_events(
    event_key,event_type,source,payload,occurred_at
  )
  values (
    btrim(p_event_key),p_event_type,p_source,p_payload,p_occurred_at
  )
  on conflict (event_key) do nothing
  returning * into v_event;

  if v_event.id is null then
    select * into v_event
    from public.notification_events
    where event_key = btrim(p_event_key);
  else
    v_created := true;
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'eventKey', v_event.event_key,
    'created', v_created,
    'fanoutStatus', v_event.fanout_status
  );
end;
$$;

revoke all on function private.notification_event_enqueue(
  text,text,text,timestamptz,jsonb
) from public, anon, authenticated;
```

Do not grant the private core to client roles.

Add the narrow public RPC wrapper that Edge Functions can reach through PostgREST:

```sql
create or replace function public.notification_event_enqueue_server(
  p_event_key text,
  p_event_type text,
  p_source text,
  p_occurred_at timestamptz,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.notification_event_enqueue(
    p_event_key,
    p_event_type,
    p_source,
    p_occurred_at,
    p_payload
  );
$$;

revoke all on function public.notification_event_enqueue_server(
  text,text,text,timestamptz,jsonb
) from public, anon, authenticated;

grant execute on function public.notification_event_enqueue_server(
  text,text,text,timestamptz,jsonb
) to service_role;
```

The wrapper contains no second event-insert implementation; it delegates to the single private core.

- [ ] **Step 5: Add duplicate-key, wrapper-grant, and client-forgery tests**

Add two calls with the same `event_key` and assert exactly one row plus `created=true/false`. Assert anon/authenticated cannot call either enqueue function, while `service_role` can call `public.notification_event_enqueue_server(...)` and receives the same idempotent result.

- [ ] **Step 6: Run database tests**

Run:

```bash
npx supabase test db
```

Expected: PASS for the schema/enqueue/security assertions introduced in this task.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260903133000_notification_dispatch_schema.sql \
        supabase/tests/database/notification_dispatch.test.sql
git commit -m "feat(notifications): add event and outbox schema"
```

---

### Task 2: Add server-side renderer, member filtering, fan-out, and event recovery

**Files:**
- Create: `supabase/migrations/20260903133500_notification_dispatch_pipeline.sql`
- Modify: `supabase/tests/database/notification_dispatch.test.sql`

**Interfaces:**
- Consumes: `private.notification_event_enqueue(text,text,text,timestamptz,jsonb)`.
- Produces: `private.notification_render_payload(p_event_type text, p_event_key text, p_payload jsonb) returns jsonb`.
- Produces: `private.notification_member_matches(p_member_id uuid, p_event_type text, p_payload jsonb) returns boolean`.
- Produces: `private.notification_fanout_event(p_event_id uuid) returns integer`.
- Produces: `private.notification_fanout_drain(p_limit integer default 50, p_now timestamptz default now()) returns jsonb`.
- Produces: `private.notification_retry_delay_minutes(p_attempt integer) returns integer`.

- [ ] **Step 1: Add failing pgTAP cases for member filtering**

Seed active members and settings with:
- result enabled for only `今彩539`,
- status enabled for `今彩539` and only `啟動`,
- card disabled,
- no stored settings for one member to verify `private.default_member_notification_settings()` is used.

Insert events and assert expected outbox counts after fan-out.

Use exact payloads:

```sql
select private.notification_event_enqueue(
  'lottery_result:539:115203',
  'lottery_result',
  'railway',
  '2026-09-03T12:00:00+08:00',
  '{"lottery":"今彩539","lotteryCode":"539","period":"115203","numbers":["01","02","03","04","05"],"drawDate":"2026-09-03"}'
);

select private.notification_event_enqueue(
  'matrix_status:539:115203:ACTIVE',
  'matrix_status',
  'railway',
  '2026-09-03T12:01:00+08:00',
  '{"lottery":"今彩539","lotteryCode":"539","period":"115203","status":"ACTIVE","statusLabel":"啟動"}'
);
```

- [ ] **Step 2: Run pgTAP to verify the fan-out tests fail**

Run:

```bash
npx supabase test db
```

Expected: FAIL because the renderer/filter/fan-out functions are missing.

- [ ] **Step 3: Implement fixed payload rendering**

Render snapshots in SQL so retries reuse the outbox payload:

```sql
create or replace function private.notification_render_payload(
  p_event_type text,
  p_event_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
begin
  case p_event_type
    when 'lottery_result' then
      v_title := p_payload->>'lottery' || ' 開獎結果';
      v_body := '第' || p_payload->>'period' || '期：' ||
        array_to_string(array(select jsonb_array_elements_text(p_payload->'numbers')), '、');
    when 'matrix_status' then
      v_title := 'Matrix 狀態｜' || p_payload->>'lottery';
      v_body := '第' || p_payload->>'period' || '期：' || p_payload->>'statusLabel';
    when 'matrix_card' then
      v_title := 'Matrix 牌單｜' || p_payload->>'lottery';
      v_body := '第' || p_payload->>'period' || '期牌單已更新';
    when 'bet_reminder' then
      v_title := p_payload->>'lottery' || ' 選號提醒';
      v_body := '已到您設定的選號提醒時間';
    when 'membership_expiry' then
      v_title := 'Matrix Pro 即將到期';
      v_body := '方案將於 ' || p_payload->>'planExpiresAt' ||
        ' 到期（提前' || p_payload->>'daysBefore' || '日提醒）';
    when 'system_notice' then
      v_title := p_payload->>'title';
      v_body := p_payload->>'body';
    else
      raise exception using errcode = '22023', message = 'UNKNOWN_NOTIFICATION_EVENT';
  end case;

  return jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'url', '/',
    'tag', pg_catalog.encode(extensions.digest(p_event_key, 'sha256'), 'hex')
  );
end;
$$;
```

`pgcrypto` is already installed in production under schema `extensions`; use `extensions.digest` and do not add another crypto dependency.

- [ ] **Step 4: Implement member matching against the existing JSON shape**

Use `coalesce(notification_settings.settings, private.default_member_notification_settings())`, active-member status rules matching `private.active_member_id()`, and exact category filters.

For `matrix_status`, compare `payload.statusLabel` (`啟動/聚合/共振/臨界`) against `statusOptions[lottery]`, not the English status code.

For `system_notice`, require the category in `selectedOptions.system`.

For `bet_reminder` and `membership_expiry`, the event is already member-scoped; require `payload.memberId = member.id` in addition to the relevant top-level setting.

- [ ] **Step 5: Implement idempotent fan-out and retry**

Claim events with `for update skip locked`. For each event:
1. set `processing`, `processing_started_at`, increment `fanout_attempt_count`;
2. insert matching member outbox rows with `on conflict do nothing`;
3. set event `complete` even when zero members match;
4. on transient failure, return event to `pending`, set `last_error`, set `next_fanout_at`;
5. after attempt 5, set `failed`.

Use retry minutes `1,2,5,15,30`.

Recovery query:

```sql
update public.notification_events
set fanout_status = 'pending',
    processing_started_at = null,
    next_fanout_at = p_now,
    updated_at = p_now
where fanout_status = 'processing'
  and processing_started_at <= p_now - interval '5 minutes';
```

- [ ] **Step 6: Add fan-out idempotency and stale recovery tests**

Run the same event fan-out twice and assert one `(event,member,web_push)` row. Put an event in `processing` six minutes ago, run recovery/drain, and assert it is claimable again.

- [ ] **Step 7: Run pgTAP green**

```bash
npx supabase test db
```

Expected: PASS for renderer/filter/fan-out/recovery.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260903133500_notification_dispatch_pipeline.sql \
        supabase/tests/database/notification_dispatch.test.sql
git commit -m "feat(notifications): add member fanout pipeline"
```

---

### Task 3: Add atomic dispatcher claim/finalize RPCs

**Files:**
- Create: `supabase/migrations/20260903133700_notification_dispatch_rpc.sql`
- Modify: `supabase/tests/database/notification_dispatch.test.sql`

**Interfaces:**
- Produces service-role-only RPCs used by `notification-dispatch`.
- `public.notification_dispatch_claim(p_limit integer default 25, p_now timestamptz default now())` returns: `outboxId`, `memberId`, `userId`, `eventId`, `eventKey`, `payload`, `attemptCount`.
- `public.notification_dispatch_mark_sent(p_outbox_id uuid, p_processed_at timestamptz) returns boolean`.
- `public.notification_dispatch_mark_skipped(p_outbox_id uuid, p_reason text, p_processed_at timestamptz) returns boolean`.
- `public.notification_dispatch_mark_retry(p_outbox_id uuid, p_error text, p_next_attempt_at timestamptz) returns boolean`.
- `public.notification_dispatch_mark_failed(p_outbox_id uuid, p_error text, p_processed_at timestamptz) returns boolean`.
- Every finalizer mutates exactly one `status='processing'` row or returns false.

- [ ] **Step 1: Add failing pgTAP tests for service-role-only dispatcher RPCs**

Assert:
- anon/authenticated cannot execute claim/finalizers;
- service_role can claim due rows;
- two consecutive claims do not return the same processing row;
- stale `processing` outbox older than five minutes is reclaimable;
- sent/skipped/failed are terminal.

- [ ] **Step 2: Run pgTAP red**

Run:

```bash
npx supabase test db
```

Expected: FAIL on missing dispatcher RPCs.

- [ ] **Step 3: Implement claim RPC with `skip locked`**

The function must join `public.members` so Edge Functions receive the auth user id without a second trust-sensitive lookup:

```sql
create or replace function public.notification_dispatch_claim(
  p_limit integer default 25,
  p_now timestamptz default now()
)
returns table(
  "outboxId" uuid,
  "memberId" uuid,
  "userId" uuid,
  "eventId" uuid,
  "eventKey" text,
  "payload" jsonb,
  "attemptCount" integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
  set status = 'pending',
      processing_started_at = null,
      next_attempt_at = p_now,
      updated_at = p_now
  where status = 'processing'
    and processing_started_at <= p_now - interval '5 minutes';

  return query
  with due as (
    select o.id
    from public.notification_outbox o
    where o.status = 'pending'
      and (o.next_attempt_at is null or o.next_attempt_at <= p_now)
    order by o.created_at, o.id
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ),
  claimed as (
    update public.notification_outbox o
    set status = 'processing',
        processing_started_at = p_now,
        attempt_count = o.attempt_count + 1,
        updated_at = p_now
    from due
    where o.id = due.id
    returning o.*
  )
  select c.id, c.member_id, m.auth_user_id, c.event_id, e.event_key,
         c.notification_payload, c.attempt_count
  from claimed c
  join public.members m on m.id = c.member_id
  join public.notification_events e on e.id = c.event_id;
end;
$$;
```

- [ ] **Step 4: Implement exact terminal/retry finalizers**

Use the exact functions declared in the interface block. The common update rule is `where id = p_outbox_id and status = 'processing'`.

`notification_dispatch_mark_sent`:
```sql
update public.notification_outbox
set status = 'sent',
    last_error = null,
    processing_started_at = null,
    processed_at = p_processed_at,
    updated_at = p_processed_at
where id = p_outbox_id and status = 'processing';
```

`notification_dispatch_mark_skipped` sets `status='skipped'`, `last_error=p_reason`, clears `processing_started_at`, and sets `processed_at=p_processed_at`.

`notification_dispatch_mark_retry` sets `status='pending'`, `last_error=p_error`, `next_attempt_at=p_next_attempt_at`, clears `processing_started_at`, and keeps `processed_at=null`.

`notification_dispatch_mark_failed` sets `status='failed'`, `last_error=p_error`, clears `processing_started_at`, and sets `processed_at=p_processed_at`.

Each function returns `found` after the update and is granted only to `service_role`; revoke from `public, anon, authenticated`.

- [ ] **Step 5: Run pgTAP green**

Run:

```bash
npx supabase test db
```

Expected: PASS for claim concurrency/recovery/permissions/finalizers.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260903133700_notification_dispatch_rpc.sql \
        supabase/tests/database/notification_dispatch.test.sql
git commit -m "feat(notifications): add dispatcher claim rpc"
```

---

### Task 4: Extract one shared Web Push delivery primitive

**Files:**
- Create: `supabase/functions/_shared/web-push-delivery.ts`
- Create: `supabase/functions/_shared/web-push-delivery.test.ts`
- Modify: `supabase/functions/send-test-push/handler.ts`
- Modify: `supabase/functions/send-test-push/index.ts`
- Modify: `supabase/functions/send-test-push/handler.test.ts`

**Interfaces:**
- Produces: `deliverPushToSubscription(deps, input) -> Promise<PushDeliveryResult>`.
- `PushDeliveryResult` is `{ delivered: boolean; permanentFailure: boolean; failureReason: string | null; sentAt: string }`.
- Consumes a payload `{title, body, url, tag?}` and current `PushSubscription`.
- Keeps `push_delivery_logs.admin_account` caller-supplied.

- [ ] **Step 1: Write shared primitive tests first**

Test:
1. success marks subscription success and records `sent`;
2. 404/410 marks failure with `disable=true` and `permanentFailure=true`;
3. transport/provider failure marks failure without disabling;
4. log-write failure rejects after the real push attempt and is not reclassified as provider failure.

- [ ] **Step 2: Run Deno test red**

Run:

```bash
deno test supabase/functions/_shared/web-push-delivery.test.ts
```

Expected: FAIL because `_shared/web-push-delivery.ts` does not exist.

- [ ] **Step 3: Implement the primitive**

Move `failureReason`, `expiredEndpoint`, subscription timestamps, and delivery-log assembly into the shared module. Keep VAPID configuration and actual `webpush.sendNotification` wiring in the callers’ `index.ts`.

Core signature:

```ts
export async function deliverPushToSubscription(
  dependencies: DeliveryDependencies,
  input: {
    userId: string;
    subscription: PushSubscription;
    payload: PushPayload;
    adminAccount: string;
  },
): Promise<PushDeliveryResult>
```

- [ ] **Step 4: Refactor `send-test-push` to call the primitive**

Preserve:
- service-role bearer authentication;
- request body `{userId, adminAccount}`;
- fixed test title/body/url;
- 409 when no enabled subscriptions;
- response `{sent, failed}`.

No test-push endpoint or admin UI contract changes.

The outbox payload may contain `tag`, but the current Service Worker only forwards `body`, icon, and URL into `showNotification`. Keep `tag` in the durable payload for observability/future compatibility; do not change the Service Worker in this feature.

- [ ] **Step 5: Run shared and existing test-push tests**

Run:

```bash
deno test \
  supabase/functions/_shared/web-push-delivery.test.ts \
  supabase/functions/send-test-push/handler.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared \
        supabase/functions/send-test-push
git commit -m "refactor(notifications): share web push delivery"
```

---

### Task 5: Implement protected notification ingest Edge Function

**Files:**
- Create: `supabase/functions/notification-ingest/handler.ts`
- Create: `supabase/functions/notification-ingest/handler.test.ts`
- Create: `supabase/functions/notification-ingest/index.ts`
- Create: `supabase/functions/notification-ingest/deno.json`

**Interfaces:**
- Consumes header `x-matrix-notification-token`.
- Consumes body `{eventKey,eventType,source,occurredAt,payload}`.
- Produces HTTP 200 `{id,eventKey,created,fanoutStatus}` for both new and duplicate valid events.
- Calls `public.notification_event_enqueue_server(text,text,text,timestamptz,jsonb)` through a service-role Supabase client; the public wrapper delegates to the single private core.

- [ ] **Step 1: Write failing handler tests**

Cases:
- missing token → 401;
- wrong token → 403;
- unknown event type → 400;
- event key not matching payload → 400;
- malformed date/payload → 400;
- valid event → enqueue dependency called once;
- duplicate enqueue result still → 200.

- [ ] **Step 2: Run Deno red**

Run:

```bash
deno test supabase/functions/notification-ingest/handler.test.ts
```

Expected: FAIL because handler is missing.

- [ ] **Step 3: Implement exact event schemas and deterministic key validation**

Accept these payload shapes:

```ts
type LotteryResultPayload = {
  lottery: "今彩539" | "天天樂" | "六合彩" | "大樂透";
  lotteryCode: "539" | "fantasy5" | "marksix" | "lotto649";
  period: string;
  numbers: string[];
  drawDate: string;
};

type MatrixStatusPayload = {
  lottery: LotteryName;
  lotteryCode: LotteryCode;
  period: string;
  status: "ACTIVE" | "FOCUS" | "RESONANCE" | "CRITICAL";
  statusLabel: "啟動" | "聚合" | "共振" | "臨界";
};

type MatrixCardPayload = {
  lottery: LotteryName;
  lotteryCode: LotteryCode;
  period: string;
};

type SystemNoticePayload = {
  noticeId: string;
  category: "維護" | "更新";
  title: string;
  body: string;
};
```

External ingest accepts only `source='railway'` for the first three event types and `source='admin'` for `system_notice`. `bet_reminder` and `membership_expiry` are DB/Cron-only and must be rejected by the HTTP ingest handler.

Expected keys:

```ts
lottery_result:${lotteryCode}:${period}
matrix_status:${lotteryCode}:${period}:${status}
matrix_card:${lotteryCode}:${period}
system_notice:${noticeId}
```

Validate title 1–80 and body 1–240 Unicode code points for `system_notice`.

- [ ] **Step 4: Wire index.ts**

Read:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MATRIX_NOTIFICATION_INGEST_TOKEN`

Call the public service-role-only RPC wrapper:

```ts
const { data, error } = await supabase.rpc("notification_event_enqueue_server", {
  p_event_key: event.eventKey,
  p_event_type: event.eventType,
  p_source: event.source,
  p_occurred_at: event.occurredAt,
  p_payload: event.payload,
});
if (error) throw error;
```

Do not attempt to expose the `private` schema through PostgREST. Handle only `POST` and `OPTIONS`; return the normal preflight response for `OPTIONS`, reject other methods with 405, and never rely on CORS for security.

- [ ] **Step 5: Run handler tests**

Run:

```bash
deno test supabase/functions/notification-ingest/handler.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/notification-ingest
git commit -m "feat(notifications): add protected event ingest"
```

---

### Task 6: Implement formal notification dispatcher Edge Function

**Files:**
- Create: `supabase/functions/notification-dispatch/handler.ts`
- Create: `supabase/functions/notification-dispatch/handler.test.ts`
- Create: `supabase/functions/notification-dispatch/index.ts`
- Create: `supabase/functions/notification-dispatch/deno.json`

**Interfaces:**
- Consumes header `x-matrix-dispatch-token`.
- Claims work only through `public.notification_dispatch_claim`.
- Uses `_shared/web-push-delivery.ts`.
- Returns aggregate `{claimed,sent,skipped,retried,failed}`.
- Never accepts `userId`, `title`, `body`, or arbitrary recipients from request JSON.

- [ ] **Step 1: Write dispatcher handler tests first**

Use injected dependencies and assert:
- wrong/missing dispatch token rejected;
- request body recipient/title/body fields are ignored and cannot select a recipient;
- no subscriptions → `notification_dispatch_mark_skipped(outboxId, 'no_enabled_subscription', processedAt)`;
- one of two endpoints succeeds → `notification_dispatch_mark_sent(outboxId, processedAt)`;
- 404/410 only → `notification_dispatch_mark_skipped(outboxId, 'no_valid_subscription', processedAt)`;
- transient failures only → `notification_dispatch_mark_retry(outboxId, error, nextRetryAt)`;
- fifth failed attempt → `notification_dispatch_mark_failed(outboxId, error, processedAt)`;
- delivery log failure bubbles so the outbox is left recoverable rather than falsely sent.

- [ ] **Step 2: Run Deno red**

Run:

```bash
deno test supabase/functions/notification-dispatch/handler.test.ts
```

Expected: FAIL because handler is missing.

- [ ] **Step 3: Implement deterministic retry schedule**

```ts
const RETRY_MINUTES = [1, 2, 5, 15, 30] as const;

function nextRetryAt(now: Date, attemptCount: number) {
  const minutes = RETRY_MINUTES[Math.min(attemptCount - 1, RETRY_MINUTES.length - 1)];
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}
```

`attemptCount >= 5` with only transient failures becomes terminal `failed`.

- [ ] **Step 4: Implement outbox outcome rules**

For each claimed row:
- list enabled subscriptions by `userId`;
- deliver each with `adminAccount='system:notification-dispatch'`;
- if any delivery succeeds → `sent`;
- if there were no subscriptions → `skipped/no_enabled_subscription`;
- if all failures are permanent → `skipped/no_valid_subscription`;
- otherwise retry or fail by attempt count.

- [ ] **Step 5: Wire index.ts**

Read:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MATRIX_NOTIFICATION_DISPATCH_TOKEN`
- existing `WEB_PUSH_PUBLIC_KEY`
- existing `WEB_PUSH_PRIVATE_KEY`
- existing `WEB_PUSH_SUBJECT`

Configure VAPID exactly once, use service role for claim/finalizer RPCs and subscription/log writes.

- [ ] **Step 6: Run dispatcher + shared push tests**

Run:

```bash
deno test \
  supabase/functions/_shared/web-push-delivery.test.ts \
  supabase/functions/notification-dispatch/handler.test.ts \
  supabase/functions/send-test-push/handler.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/notification-dispatch \
        supabase/functions/_shared \
        supabase/functions/send-test-push
git commit -m "feat(notifications): add outbox dispatcher"
```

---

### Task 7: Add time-based events and one-minute Supabase Cron

**Files:**
- Create: `supabase/migrations/20260903133800_notification_dispatch_time_events.sql`
- Create: `supabase/migrations/20260903134000_notification_dispatch_cron.sql`
- Modify: `supabase/tests/database/notification_dispatch.test.sql`

**Interfaces:**
- Produces: `private.notification_time_events_tick(p_now timestamptz default now()) returns jsonb`.
- Produces: `private.notification_pipeline_tick(p_now timestamptz default now()) returns jsonb`.
- Cron job `matrix-notification-pipeline-minute` calls the DB tick every minute.
- Cron job `matrix-notification-dispatch-minute` invokes `notification-dispatch` every minute through `pg_net`.
- Vault secret names:
  - `matrix_project_url`
  - `matrix_notification_dispatch_token`

- [ ] **Step 1: Add failing pgTAP time-event tests**

For bet reminder:
- store `betTimes.今彩539=["16:00",""]`;
- call tick at `2026-09-03 16:00:15 Asia/Taipei`;
- call it again in the same minute;
- assert exactly one `bet_reminder:${member_id}:539:${scheduled_at}` event.

For expiry:
- set `plan_expires_at='2026-09-10T00:00:00+08:00'`, non-lifetime;
- select `提前7日`;
- call tick twice on 2026-09-03;
- assert one `membership_expiry:${member_id}:2026-09-10:7` event.

- [ ] **Step 2: Run pgTAP red**

Run:

```bash
npx supabase test db
```

Expected: FAIL because time-event functions are missing.

- [ ] **Step 3: Implement `notification_time_events_tick`**

Use:

```sql
v_local_now := p_now at time zone 'Asia/Taipei';
v_local_minute := to_char(v_local_now, 'HH24:MI');
v_local_date := v_local_now::date;
```

Bet reminders only create events for non-empty configured times exactly equal to `v_local_minute`. `scheduledAt` is the local minute converted to an ISO timestamptz.

Expiry reminders are created on matching local dates; because the event key includes member, expiry date, and lead days, the first successful Cron tick that day wins and later ticks are duplicates.

Exclude:
- `is_lifetime=true`;
- null `plan_expires_at`;
- disabled/inactive members;
- members whose `settings.expiry` is false;
- lead-day values not present in `selectedOptions.expiry`.

- [ ] **Step 4: Implement `notification_pipeline_tick`**

One DB function performs:
1. time-event enqueue;
2. stale event recovery;
3. event fan-out drain.

Keep dispatcher HTTP separate so database work remains testable without network.

- [ ] **Step 5: Create Cron migration using supported extensions**

The project currently has `supabase_vault` installed; `pg_cron` and `pg_net` are available but not installed. Enable them:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
```

Create the trusted HTTP tick. It reads only named Vault secrets and never stores the token in a public table:

```sql
create or replace function private.notification_dispatch_http_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_dispatch_token text;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_project_url
  from vault.decrypted_secrets
  where name = 'matrix_project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
    into v_dispatch_token
  from vault.decrypted_secrets
  where name = 'matrix_notification_dispatch_token'
  order by created_at desc
  limit 1;

  if pg_catalog.nullif(pg_catalog.btrim(v_project_url), '') is null
     or pg_catalog.nullif(pg_catalog.btrim(v_dispatch_token), '') is null then
    raise exception using errcode = '55000', message = 'NOTIFICATION_DISPATCH_VAULT_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/notification-dispatch',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-matrix-dispatch-token', v_dispatch_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.notification_dispatch_http_tick()
  from public, anon, authenticated;
```

Make schedule creation migration-idempotent by removing an existing same-name job before creating it:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'matrix-notification-pipeline-minute',
  'matrix-notification-dispatch-minute'
);

select cron.schedule_in_database(
  'matrix-notification-pipeline-minute',
  '* * * * *',
  $$select private.notification_pipeline_tick(pg_catalog.now());$$,
  pg_catalog.current_database(),
  null,
  false
);

select cron.schedule_in_database(
  'matrix-notification-dispatch-minute',
  '* * * * *',
  $$select private.notification_dispatch_http_tick();$$,
  pg_catalog.current_database(),
  null,
  false
);
```

The migration deliberately creates both jobs **inactive**. This allows schema/functions to be deployed without generating real `bet_reminder` / `membership_expiry` events before the user authorizes production activation. When go-live is separately authorized, activate by resolving each `jobid` by `jobname` and calling `cron.alter_job(jobid, active := true)`; do not update `cron.job` directly.

The dispatch Edge Function is intentionally a custom-token server endpoint, so its Supabase gateway JWT verification must be disabled at deployment; the handler's constant-time `x-matrix-dispatch-token` check is the trust boundary.

- [ ] **Step 6: Verify Cron migration does not hardcode secrets**

Run:

```bash
grep -R "MATRIX_NOTIFICATION_DISPATCH_TOKEN\\|SUPABASE_SERVICE_ROLE_KEY" \
  supabase/migrations/20260903134000_notification_dispatch_cron.sql
```

Expected: no literal secret value; only Vault secret names and lookup code.

- [ ] **Step 7: Run database tests**

Run:

```bash
npx supabase test db
```

Expected: PASS for time-event dedupe and pipeline tick behavior.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260903133800_notification_dispatch_time_events.sql \
        supabase/migrations/20260903134000_notification_dispatch_cron.sql \
        supabase/tests/database/notification_dispatch.test.sql
git commit -m "feat(notifications): add cron and time events"
```

---

### Task 8: Add Railway notification event client

**Files:**
- Create: `services/matrix-api/app/services/notification_events.py`
- Create: `services/matrix-api/tests/test_notification_events.py`
- Modify: `services/matrix-api/app/settings.py`

**Interfaces:**
- Produces `NotificationConfigurationError` and `NotificationDeliveryError`.
- Produces `NotificationEventEmitter(url: str, token: str, client: httpx.Client)` with `enabled: bool` and `emit(event: dict[str, Any]) -> dict[str, Any]`.
- Produces helpers:
  - `lottery_result_event(draw)`.
  - `matrix_card_event(draw)`.
  - `matrix_status_event(lottery, period, status_artifact)`.
- Mapping:
  - `今彩539 -> 539`
  - `天天樂 -> fantasy5`
  - `六合彩 -> marksix`
  - `大樂透 -> lotto649`
- Status mapping:
  - `ACTIVE -> 啟動`
  - `FOCUS -> 聚合`
  - `RESONANCE -> 共振`
  - `CRITICAL -> 臨界`
  - `DORMANT -> no matrix_status event`

- [ ] **Step 1: Write pure event-key/payload tests**

Example:

```python
def test_lottery_result_event_is_stable() -> None:
    event = lottery_result_event({
        "lottery": "今彩539",
        "period": "115203",
        "drawDate": "2026-09-03",
        "numbers": ["01", "02", "03", "04", "05"],
    })
    assert event["eventKey"] == "lottery_result:539:115203"
    assert event["source"] == "railway"
```

Add status tests that `DORMANT` returns `None`.

- [ ] **Step 2: Run pytest red**

Run:

```bash
cd services/matrix-api
python -m pytest tests/test_notification_events.py -q
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the HTTP emitter**

Use `httpx.Client.post()` to `notification_ingest_url`, header `x-matrix-notification-token`, JSON body event. Accept 200 only; parse `{created,eventKey}`. Raise `NotificationConfigurationError` for HTTP 4xx and `NotificationDeliveryError` for HTTP 5xx or transport failures.

Configuration fields:

```python
@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_secret_key: str = ""
    notification_ingest_url: str = ""
    notification_ingest_token: str = ""
```

`NotificationEventEmitter` is disabled only when both ingest URL and token are empty. Exactly one configured is an error.

- [ ] **Step 4: Add HTTP retry-behavior tests with `httpx.MockTransport`**

Verify:
- duplicate 200 is success;
- 403 raises configuration error;
- 500 raises delivery error;
- connection failure raises delivery error;
- disabled emitter performs no network call.

- [ ] **Step 5: Run pytest green**

Run:

```bash
cd services/matrix-api
python -m pytest tests/test_notification_events.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/matrix-api/app/services/notification_events.py \
        services/matrix-api/tests/test_notification_events.py \
        services/matrix-api/app/settings.py
git commit -m "feat(worker): add notification event emitter"
```

---

### Task 9: Wire Railway result/card/status producers at durable completion points

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/tests/test_worker.py`

**Interfaces:**
- Consumes `NotificationEventEmitter`.
- Uses existing `repository.read_artifact(lottery, period, analysis_version, "status")`.
- Uses existing `card_layout(lottery)["column_rows"]` only to verify the current on-demand card can render; no card artifact is persisted.

- [ ] **Step 1: Add worker tests before wiring**

Create a fake emitter recording `eventKey`s and assert:
1. newly acquired draw eventually emits one result and one card event;
2. status emits only after analysis reaches `complete`;
3. DORMANT status emits no matrix-status event;
4. failed/partial analysis never emits matrix-status;
5. rerunning an already-complete period re-emits the same stable keys to ingest, relying on Supabase dedupe;
6. notification integration disabled leaves existing worker behavior/result unchanged;
7. card event is not emitted when available history is below the current card layout’s required row count.

- [ ] **Step 2: Run targeted worker tests red**

Run:

```bash
cd services/matrix-api
python -m pytest tests/test_worker.py -q
```

Expected: new event assertions FAIL while pre-existing worker tests remain unchanged.

- [ ] **Step 3: Add readiness helper**

Introduce a worker-local helper:

```python
def _card_ready(lottery: str, repository: AnalysisRepository) -> bool:
    required = sum(card_layout(lottery)["column_rows"])
    return len(repository.list_draws(lottery, required)) >= required
```

Do not render SVG in the worker.

- [ ] **Step 4: Add idempotent ready-event emission**

Extend `run_scheduled_worker` with an optional injected emitter while keeping existing callers compatible:

```python
def run_scheduled_worker(
    lottery: str,
    now: datetime | None,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
    notification_emitter: NotificationEventEmitter | None = None,
) -> dict[str, Any]:
```

For each invocation keep:

```python
emitted_event_keys: set[str] = set()
```

After the latest draw is durably stored, attempt `lottery_result` and, only when `_card_ready(...)`, `matrix_card`. Add a key to `emitted_event_keys` only after ingest returns 200.

After analysis completes, call:

```python
emit_ready_notifications(
    lottery,
    period,
    repository,
    notification_emitter,
    emitted_event_keys,
)
```

It emits any ready key not already successful in this invocation:
- `lottery_result`;
- `matrix_card` only if `_card_ready`;
- `matrix_status` from the stored status artifact if non-DORMANT.

On a later worker invocation the set starts empty, so an already-complete period re-emits the same stable keys to Supabase; global event-key dedupe makes those HTTP retries harmless.

Do not query notification members or subscriptions from Railway.

- [ ] **Step 5: Preserve algorithm progress even when early result/card ingest is unavailable**

Wrap only the **early** result/card attempt so a transient ingest error does not stop Matrix analysis. Failed early keys are not added to `emitted_event_keys`, therefore the final ready-event call retries them. The final ready-event call is not swallowed: if ingest is still unavailable, fail the worker invocation so Railway retries later without discarding the already-complete analysis.

- [ ] **Step 6: Run worker tests**

Run:

```bash
cd services/matrix-api
python -m pytest tests/test_notification_events.py tests/test_worker.py -q
```

Expected: PASS.

- [ ] **Step 7: Run the full matrix-api suite**

Run:

```bash
cd services/matrix-api
python -m pytest -q
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add services/matrix-api/app/worker.py \
        services/matrix-api/tests/test_worker.py
git commit -m "feat(worker): emit completed notification events"
```

---

### Task 10: Add authorized admin `system_notice` API without new UI

**Files:**
- Create: `apps/admin/backend/notification-events.ts`
- Create: `apps/admin/backend/notification-events.test.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `apps/admin/backend/index-wiring.test.ts`

**Interfaces:**
- Produces backend endpoint `POST /api/system-notices`.
- Requires existing `sessionGuard` + global `guard('edit')`.
- Body: `{category,title,body}`.
- Admin backend generates `noticeId = crypto.randomUUID()` and calls `notification-ingest` with `source='admin'`.
- Does not send Web Push directly.

- [ ] **Step 1: Write admin helper tests first**

Verify:
- category outside `維護/更新` rejected;
- blank title/body rejected;
- title >80 or body >240 Unicode code points rejected;
- valid input generates `system_notice:<noticeId>`;
- ingest request carries the server-only token header;
- ingest 4xx/5xx becomes a backend error, not success.

- [ ] **Step 2: Run admin tests red**

Run:

```bash
cd apps/admin
npm test -- backend/notification-events.test.ts
```

Expected: FAIL because helper is missing.

- [ ] **Step 3: Implement `notification-events.ts`**

Read `SUPABASE_URL` and `MATRIX_NOTIFICATION_INGEST_TOKEN` from AppDeploy secrets. Do not reuse a browser-accessible value.

Construct:

```ts
{
  eventKey: `system_notice:${noticeId}`,
  eventType: 'system_notice',
  source: 'admin',
  occurredAt: new Date().toISOString(),
  payload: { noticeId, category, title, body }
}
```

- [ ] **Step 4: Wire protected route**

In `apps/admin/backend/index.ts`:

```ts
'POST /api/system-notices': [
  sessionGuard,
  guard('edit'),
  async (ctx: Context) => {
    const admin = await getAdmin(ctx);
    const notice = await notificationEvents.sendSystemNotice(bodyOf(ctx));
    if (shouldRecordAdminActivity(admin)) {
      const actor = actorOf(admin);
      try {
        await supabase.insertRows('audit_logs', [{
          admin_id: actor.id,
          admin: actor.name || actor.account,
          operation_type: '發送系統通知',
          target_table: 'notification_events',
          target_id: notice.eventKey,
          content: `${notice.category}：${notice.title}`,
          before_data: null,
          after_data: notice,
          ...requestMetadata(ctx),
        }]);
      } catch {
        // A successfully accepted notification event must not look failed only because audit storage is unavailable.
      }
    }
    return json({ notice }, 201);
  },
],
```

Use the existing audit policy and data-access pattern; do not add a UI in this task.

- [ ] **Step 5: Verify route wiring and permissions**

Run:

```bash
npx vitest run \
  apps/admin/backend/notification-events.test.ts \
  apps/admin/backend/index-wiring.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/backend/notification-events.ts \
        apps/admin/backend/notification-events.test.ts \
        apps/admin/backend/index.ts \
        apps/admin/backend/index-wiring.test.ts
git commit -m "feat(admin): add formal system notification event api"
```

---

### Task 11: Add deployment secrets, Vault entries, and deploy functions without enabling production event emission

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-03-notification-dispatch-verification.md`
- No source-code modifications in this task.

**Interfaces:**
- Supabase Edge secrets:
  - `MATRIX_NOTIFICATION_INGEST_TOKEN`
  - `MATRIX_NOTIFICATION_DISPATCH_TOKEN`
  - existing `SUPABASE_URL`
  - existing `SUPABASE_SERVICE_ROLE_KEY`
  - existing Web Push VAPID secrets.
- Supabase Vault:
  - `matrix_project_url`
  - `matrix_notification_dispatch_token`.
- Railway:
  - `MATRIX_NOTIFICATION_INGEST_URL=https://wcimzbbapfrdotjsfyxa.supabase.co/functions/v1/notification-ingest`
  - `MATRIX_NOTIFICATION_INGEST_TOKEN` set to the `INGEST_TOKEN` value generated in Step 1.
- AppDeploy admin:
  - `MATRIX_NOTIFICATION_INGEST_TOKEN` set to the `INGEST_TOKEN` value generated in Step 1.

- [ ] **Step 1: Generate independent server tokens at execution time**

Use a cryptographically random 32-byte value for each token:

```bash
INGEST_TOKEN="$(openssl rand -hex 32)"
DISPATCH_TOKEN="$(openssl rand -hex 32)"
test "${#INGEST_TOKEN}" -eq 64
test "${#DISPATCH_TOKEN}" -eq 64
test "$INGEST_TOKEN" != "$DISPATCH_TOKEN"
```

Never commit the resulting values.

- [ ] **Step 2: Apply migrations to a local/test Supabase first**

Run:

```bash
npx supabase db reset
npx supabase test db
```

Expected: all database tests PASS locally before remote migration.

- [ ] **Step 3: Set Edge secrets, then deploy with the intended gateway-auth mode**

Set server-only Edge secrets:

```bash
npx supabase secrets set \
  MATRIX_NOTIFICATION_INGEST_TOKEN="$INGEST_TOKEN" \
  MATRIX_NOTIFICATION_DISPATCH_TOKEN="$DISPATCH_TOKEN"
```

Deploy the two custom-token server endpoints with Supabase gateway JWT verification disabled:

```bash
npx supabase functions deploy notification-ingest --no-verify-jwt
npx supabase functions deploy notification-dispatch --no-verify-jwt
```

Deploy the refactored diagnostic function without changing its current service-role/JWT model:

```bash
npx supabase functions deploy send-test-push
```

Do not invoke ingest or formal dispatch yet.

- [ ] **Step 4: Create/update Vault secrets before applying the remote Cron migration**

Using the authenticated Supabase SQL administration surface, create or update these named Vault secrets:
- `matrix_project_url` → `https://wcimzbbapfrdotjsfyxa.supabase.co`
- `matrix_notification_dispatch_token` → the exact `$DISPATCH_TOKEN` value

Use Vault's `vault.create_secret` / `vault.update_secret` APIs; verify by name only:

```sql
select name
from vault.decrypted_secrets
where name in (
  'matrix_project_url',
  'matrix_notification_dispatch_token'
)
order by name;
```

Expected: exactly the two names. Never print the decrypted token into logs or handoff documents. Do not store Railway ingest tokens in public tables.

- [ ] **Step 5: Apply remote migrations only after Vault values exist, then verify Cron**

Apply the committed notification migrations to the linked project using the normal Supabase migration workflow. After migration, verify:

```sql
select jobname, schedule, active
from cron.job
where jobname in (
  'matrix-notification-pipeline-minute',
  'matrix-notification-dispatch-minute'
)
order by jobname;
```

Expected: exactly two jobs with schedule `* * * * *` and `active=false` during structural deployment.

Also verify the deployed Edge Function settings report JWT verification disabled for `notification-ingest` and `notification-dispatch`, while `send-test-push` keeps its existing JWT/service-role behavior.

- [ ] **Step 6: Keep Railway/AppDeploy producer secrets unset and both Cron jobs inactive during structural verification**

This prevents production `lottery_result`, `matrix_status`, `matrix_card`, `system_notice`, `bet_reminder`, or `membership_expiry` creation while schema/dispatcher behavior is being verified.

- [ ] **Step 7: Record factual deployment state in the handoff**

Record function versions, applied migration versions, Cron jobs, and whether producer secrets are still disabled. Do not mark E2E as passed yet.

- [ ] **Step 8: Commit only the verification document**

```bash
git add docs/superpowers/handoffs/2026-09-03-notification-dispatch-verification.md
git commit -m "docs: record notification dispatch deployment state"
```

---

### Task 12: Controlled acceptance verification and production enablement gate

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-03-notification-dispatch-verification.md`

**Interfaces:**
- No new code.
- This task is blocked on explicit user authorization before creating a controlled production notification event or changing producer secrets.

- [ ] **Step 1: Run all non-production verification before asking for E2E authorization**

Run:

```bash
npx supabase test db

deno test \
  supabase/functions/_shared/web-push-delivery.test.ts \
  supabase/functions/send-test-push/handler.test.ts \
  supabase/functions/notification-ingest/handler.test.ts \
  supabase/functions/notification-dispatch/handler.test.ts

cd services/matrix-api
python -m pytest -q
cd ../..

npx vitest run \
  apps/admin/backend/notification-events.test.ts \
  apps/admin/backend/index-wiring.test.ts

npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Verify production structure with read-only queries**

Check:
- two tables exist;
- event/outbox RLS enabled;
- client grants absent;
- expected functions exist;
- exactly two Cron jobs exist with `active=false`;
- no unexpected notification events/outbox rows were created during structural deployment.

- [ ] **Step 3: Obtain explicit user authorization for controlled production E2E**

Do not enable Railway producer secrets or create a formal system notice until the user explicitly authorizes the production E2E step.

- [ ] **Step 4: After controlled-E2E authorization, run one controlled formal event while Cron remains inactive**

For the first production E2E, use an authorized `system_notice` targeted by the real notification preferences and a controlled Web Push subscription. Configure only the AppDeploy ingest token required for that call; keep Railway producer secrets unset and both Cron jobs inactive.

Manually invoke the trusted database pipeline tick and formal dispatcher so the test cannot accidentally schedule unrelated production reminders:

```text
admin system_notice
→ notification-ingest
→ one notification_event
→ manual private.notification_pipeline_tick(now())
→ one controlled-member outbox
→ direct notification-dispatch call with dispatch token
→ controlled Web Push subscription
→ push_delivery_logs sent
```

Record every created event/outbox id so the production mutation is auditable.

- [ ] **Step 5: Verify deduplication by repeating the same event key**

Expected:
- `notification_events`: still one event row;
- `notification_outbox`: still one `(event,member,web_push)` row;
- no second outbox job.

Do not claim strict exactly-once at the browser transport layer.

- [ ] **Step 6: Verify Railway producer integration only after separate authorization for a real completed period**

To prove the Railway completion hook itself, temporarily configure `MATRIX_NOTIFICATION_INGEST_URL` and `MATRIX_NOTIFICATION_INGEST_TOKEN`, run the worker against an already-complete current period, and verify it re-emits the stable `lottery_result` / ready `matrix_card` / non-DORMANT `matrix_status` keys without creating duplicate event rows. Remove or disable the Railway ingest configuration again unless the user separately authorizes production go-live.

- [ ] **Step 7: Verify failure paths on controlled/test subscriptions**

Verify:
- expired 404/410 endpoint is disabled;
- transient failure schedules retry;
- stale event/outbox can recover after five minutes;
- no-subscription member is skipped, not failed.

- [ ] **Step 8: Keep automatic production scheduling disabled until explicit go-live authorization**

Controlled E2E authorization is not equivalent to production go-live. Leave both Cron jobs inactive and Railway producer secrets disabled after testing unless the user explicitly authorizes automatic notification go-live.

When go-live is authorized, activate both existing jobs through the supported pg_cron API:

```sql
select cron.alter_job(jobid, active := true)
from cron.job
where jobname in (
  'matrix-notification-pipeline-minute',
  'matrix-notification-dispatch-minute'
);
```

Then configure Railway producer secrets and verify the two jobs report `active=true`.

- [ ] **Step 9: Update the handoff with actual evidence**

Mark each acceptance item as one of:
- `PASS` followed by the exact command/query/log reference that proved it;
- `NOT RUN — production authorization not granted`;
- `FAIL` followed by the exact failing command/query/log reference.

Do not write “automatic notifications work” unless all ten acceptance conditions in the approved spec have evidence.

- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/handoffs/2026-09-03-notification-dispatch-verification.md
git commit -m "docs: verify notification dispatch acceptance"
```

---

## Self-Review Checklist

- Spec coverage:
  - event ingest and global dedupe → Tasks 1, 5
  - member filtering and outbox dedupe → Task 2
  - formal dispatcher/retry/recovery → Tasks 3, 4, 6
  - Railway result/status/card producers → Tasks 8, 9
  - time reminders and Supabase Cron → Task 7
  - admin system notice → Task 10
  - security and no client forgery → Tasks 1, 3, 5, 6
  - no `win`/`collision` guessing → Global Constraints
  - no PWA notification UI changes → Global Constraints/File Structure
  - controlled production E2E gate → Tasks 11, 12
  - custom-token Edge auth / no gateway JWT → Global Constraints, Tasks 5, 6, 11
  - Cron structural deploy inactive until explicit go-live → Tasks 7, 11, 12
- Type consistency:
  - external producer event names and event keys match ingest validation and DB check constraints.
  - outbox claim returns `userId` mapped from `members.auth_user_id`, matching push subscription ownership.
  - Matrix status uses English code in the event key and Chinese `statusLabel` for member preference matching.
- Current-code reconciliation:
  - Matrix card remains on-demand from `lottery_draws`; no new card artifact/table.
  - Matrix Pro expiry uses `members.plan_expires_at`.
  - existing `push_delivery_logs.admin_account` remains non-null without a schema rewrite.
  - existing send-test-push API remains available and distinct from formal dispatch.
  - Edge ingest reaches the single private enqueue core only through the service-role-only public RPC wrapper.
  - current Service Worker does not consume `tag`; no Service Worker change or browser-tag dedupe claim is included.
  - production `pg_cron` / `pg_net` are available but currently uninstalled; their installation is isolated to the Cron migration.
