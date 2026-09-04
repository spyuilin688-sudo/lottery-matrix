begin;

create table public.notification_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (
    event_type in (
      'lottery_result',
      'matrix_status',
      'matrix_card',
      'bet_reminder',
      'membership_expiry',
      'system_notice'
    )
  ),
  source text not null check (source in ('railway', 'cron', 'admin')),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  fanout_status text not null default 'pending' check (
    fanout_status in ('pending', 'processing', 'complete', 'failed')
  ),
  fanout_attempt_count integer not null default 0 check (fanout_attempt_count >= 0),
  next_fanout_at timestamptz,
  processing_started_at timestamptz,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index notification_events_due_idx
  on public.notification_events (fanout_status, next_fanout_at, created_at);

create table public.notification_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  channel text not null default 'web_push' check (channel = 'web_push'),
  notification_payload jsonb not null check (
    pg_catalog.jsonb_typeof(notification_payload) = 'object'
  ),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'sent', 'failed', 'skipped')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  processing_started_at timestamptz,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (event_id, member_id, channel)
);

create index notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at, created_at);

alter table public.notification_events enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on table public.notification_events from public, anon, authenticated;
revoke all on table public.notification_outbox from public, anon, authenticated;

grant select, insert, update, delete on table public.notification_events to service_role;
grant select, insert, update, delete on table public.notification_outbox to service_role;

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
  v_event_key text := pg_catalog.btrim(p_event_key);
begin
  if nullif(v_event_key, '') is null
    or p_event_type is null
    or p_event_type not in (
      'lottery_result',
      'matrix_status',
      'matrix_card',
      'bet_reminder',
      'membership_expiry',
      'system_notice'
    )
    or p_source is null
    or p_source not in ('railway', 'cron', 'admin')
    or p_occurred_at is null
    or p_payload is null
    or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'INVALID_NOTIFICATION_EVENT';
  end if;

  insert into public.notification_events (
    event_key,
    event_type,
    source,
    payload,
    occurred_at
  ) values (
    v_event_key,
    p_event_type,
    p_source,
    p_payload,
    p_occurred_at
  )
  on conflict (event_key) do nothing
  returning * into v_event;

  if v_event.id is null then
    select * into v_event
    from public.notification_events
    where event_key = v_event_key;
  else
    v_created := true;
  end if;

  if v_event.id is null then
    raise exception using
      errcode = '55000',
      message = 'NOTIFICATION_EVENT_ENQUEUE_FAILED';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_event.id,
    'eventKey', v_event.event_key,
    'eventType', v_event.event_type,
    'created', v_created,
    'fanoutStatus', v_event.fanout_status
  );
end;
$$;

revoke all on function private.notification_event_enqueue(
  text,
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated, service_role;

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
  text,
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;

grant execute on function public.notification_event_enqueue_server(
  text,
  text,
  text,
  timestamptz,
  jsonb
) to service_role;

commit;
