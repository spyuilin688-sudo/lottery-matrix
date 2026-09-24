-- Keep the intro page counts unchanged on repeat visits without rewriting the
-- visitor identifier. The per-visitor transaction lock and expiry stay intact.
create or replace function private.record_matrix_intro_visit(p_visitor_hash text, p_now timestamptz)
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
  elsif v_previous.last_day is distinct from v_day then
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
