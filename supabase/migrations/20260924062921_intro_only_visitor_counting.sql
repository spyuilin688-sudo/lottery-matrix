-- The public introduction page has its own audience and must never use the PWA totals.
-- Only salted hashes are stored, for at most 90 days; aggregates are retained.
create table private.matrix_intro_visitor_identifiers (
  visitor_hash text primary key check (visitor_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  last_day date not null
);
create index matrix_intro_visitor_identifiers_created_at_idx
  on private.matrix_intro_visitor_identifiers (created_at);
alter table private.matrix_intro_visitor_identifiers enable row level security;
revoke all on private.matrix_intro_visitor_identifiers from public, anon, authenticated, service_role;

create table private.matrix_intro_visitor_counts (
  period_type text not null check (period_type in ('day', 'total')),
  period_start date not null,
  visitors bigint not null default 0 check (visitors >= 0),
  primary key (period_type, period_start)
);
alter table private.matrix_intro_visitor_counts enable row level security;
revoke all on private.matrix_intro_visitor_counts from public, anon, authenticated, service_role;

create function private.record_matrix_intro_visit(p_visitor_hash text, p_now timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  v_day date;
  v_previous private.matrix_intro_visitor_identifiers%rowtype;
  v_new boolean;
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_VISITOR_HASH' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('intro:' || p_visitor_hash, 0));
  p_now := coalesce(p_now, clock_timestamp());
  v_day := (p_now at time zone 'Asia/Taipei')::date;
  select * into v_previous from private.matrix_intro_visitor_identifiers
    where visitor_hash = p_visitor_hash for update;
  v_new := not found or v_previous.created_at <= p_now - interval '90 days';
  if v_new then
    insert into private.matrix_intro_visitor_identifiers values (p_visitor_hash, p_now, v_day)
      on conflict (visitor_hash) do update
      set created_at = excluded.created_at, last_day = excluded.last_day;
    insert into private.matrix_intro_visitor_counts values ('total', date '1970-01-01', 1)
      on conflict (period_type, period_start)
      do update set visitors = matrix_intro_visitor_counts.visitors + 1;
  else
    update private.matrix_intro_visitor_identifiers set last_day = v_day
      where visitor_hash = p_visitor_hash;
  end if;
  if v_new or v_previous.last_day <> v_day then
    insert into private.matrix_intro_visitor_counts values ('day', v_day, 1)
      on conflict (period_type, period_start)
      do update set visitors = matrix_intro_visitor_counts.visitors + 1;
  end if;
end;
$$;
revoke all on function private.record_matrix_intro_visit(text, timestamptz)
  from public, anon, authenticated, service_role;

create function public.record_matrix_intro_visit_edge(p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
  v_visitor_hash text;
begin
  if p_source is null or pg_catalog.length(p_source) not between 3 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_VISITOR_SOURCE';
  end if;
  select secret into v_secret from private.matrix_visitor_secret where singleton;
  if v_secret is null then
    raise exception using errcode = '55000', message = 'VISITOR_SECRET_MISSING';
  end if;
  v_visitor_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_secret || 'intro:' || p_source, 'UTF8')),
    'hex'
  );
  perform private.record_matrix_intro_visit(v_visitor_hash, null);
end;
$$;
revoke all on function public.record_matrix_intro_visit_edge(text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_matrix_intro_visit_edge(text) to service_role;

create function public.intro_visitor_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'todayVisitors', coalesce((select visitors from private.matrix_intro_visitor_counts
      where period_type = 'day' and period_start = (now() at time zone 'Asia/Taipei')::date), 0),
    'totalVisitors', coalesce((select visitors from private.matrix_intro_visitor_counts
      where period_type = 'total'), 0)
  );
$$;
revoke all on function public.intro_visitor_stats() from public, anon, authenticated, service_role;
grant execute on function public.intro_visitor_stats() to service_role;

-- Reuse the existing retention job; the PWA's identifiers keep their current expiry.
create or replace function private.purge_matrix_visitor_identifiers()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.matrix_visitor_identifiers where created_at <= now() - interval '90 days';
  delete from private.matrix_intro_visitor_identifiers where created_at <= now() - interval '90 days';
end;
$$;
