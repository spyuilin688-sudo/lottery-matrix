-- One bounded row per lottery, service-role only. No recurring cleanup job needed.
create table public.matrix_manual_refresh_jobs (
  lottery text primary key check (lottery in ('今彩539','天天樂','六合彩','大樂透')),
  request_id uuid not null,
  status text not null check (status in ('accepted','running','complete','failed')),
  expires_at timestamptz not null,
  period text,
  draw_date text,
  error text check (error in ('SOURCE_NOT_READY','REFRESH_FAILED')),
  check (status <> 'complete' or coalesce(length(btrim(period)), 0) > 0)
);
alter table public.matrix_manual_refresh_jobs enable row level security;
revoke all on public.matrix_manual_refresh_jobs from public, anon, authenticated;
grant all on public.matrix_manual_refresh_jobs to service_role;

create function public.matrix_manual_refresh_status(p_lottery text, p_request_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('lottery', lottery, 'requestId', request_id,
    'status', case when status in ('accepted','running') and expires_at <= now() then 'failed' else status end,
    'period', period, 'drawDate', draw_date,
    'error', case when status in ('accepted','running') and expires_at <= now() then 'REFRESH_INTERRUPTED' else error end)
  from public.matrix_manual_refresh_jobs where lottery = p_lottery and request_id = p_request_id;
$$;

create function public.matrix_manual_refresh_claim(p_lottery text, p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_id uuid;
begin
  -- Atomic upsert locks the lottery row across concurrent API replicas.
  insert into public.matrix_manual_refresh_jobs as jobs (lottery, request_id, status, expires_at)
  values (p_lottery, p_request_id, 'accepted', now() + interval '30 minutes')
  on conflict (lottery) do update set request_id = excluded.request_id, status = 'accepted',
    expires_at = excluded.expires_at, period = null, draw_date = null, error = null
  where jobs.status not in ('accepted','running') or jobs.expires_at <= now();
  select request_id into current_id from public.matrix_manual_refresh_jobs where lottery = p_lottery;
  return public.matrix_manual_refresh_status(p_lottery, current_id);
end;
$$;

create function public.matrix_manual_refresh_update(
  p_lottery text, p_request_id uuid, p_status text,
  p_period text default null, p_draw_date text default null, p_error text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_status not in ('running','complete','failed') then raise exception 'invalid status'; end if;
  update public.matrix_manual_refresh_jobs set status = p_status, period = p_period, draw_date = p_draw_date, error = p_error
  where lottery = p_lottery and request_id = p_request_id and status in ('accepted','running') and expires_at > now();
  return found;
end;
$$;
revoke all on function public.matrix_manual_refresh_status(text,uuid) from public, anon, authenticated;
revoke all on function public.matrix_manual_refresh_claim(text,uuid) from public, anon, authenticated;
revoke all on function public.matrix_manual_refresh_update(text,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.matrix_manual_refresh_status(text,uuid) to service_role;
grant execute on function public.matrix_manual_refresh_claim(text,uuid) to service_role;
grant execute on function public.matrix_manual_refresh_update(text,uuid,text,text,text,text) to service_role;
