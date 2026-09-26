create table public.admin_architecture_billing_runs (
  id uuid primary key default gen_random_uuid(),
  run_day date not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','partial')),
  results jsonb,
  previous_snapshots jsonb
);
alter table public.admin_architecture_billing_runs enable row level security;
revoke all on public.admin_architecture_billing_runs from public,anon,authenticated;
grant select,insert,update on public.admin_architecture_billing_runs to service_role;

create function public.claim_admin_architecture_billing_run()
returns uuid language plpgsql security invoker set search_path='' as $fn$
declare v_id uuid;
begin
  insert into public.admin_architecture_billing_runs(run_day)
    values ((now() at time zone 'Asia/Taipei')::date)
    on conflict(run_day) do nothing returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.claim_admin_architecture_billing_run() from public,anon,authenticated;
grant execute on function public.claim_admin_architecture_billing_run() to service_role;

create function public.finish_admin_architecture_billing_run(p_run_id uuid,p_results jsonb)
returns boolean language plpgsql security invoker set search_path='' as $fn$
declare v_provider text; v_item jsonb; v_snapshot jsonb; v_previous jsonb; v_count integer;
begin
  perform 1 from public.admin_architecture_billing_runs
    where id=p_run_id and status='running' and started_at>now()-interval '10 minutes' for update;
  if not found then return false; end if;
  if jsonb_typeof(p_results) is distinct from 'object' then raise exception 'Invalid billing results'; end if;
  select jsonb_object_agg(provider,billing_snapshot) into v_previous
    from public.admin_architecture_subscriptions where provider in ('github','railway');
  foreach v_provider in array array['github','railway'] loop
    v_item:=p_results->v_provider;
    if (v_item->>'status') is null or v_item->>'status' not in ('synced','failed') then
      raise exception 'Missing provider status';
    end if;
    if v_item->>'status'='synced' then
      v_snapshot:=v_item->'snapshot';
      if jsonb_typeof(v_snapshot) is distinct from 'object'
         or coalesce(length(v_snapshot->>'source'),0) not between 1 and 200
         or coalesce(length(v_snapshot->>'verifiedAt'),0) not between 1 and 200
         or (v_snapshot->>'verifiedAt')::timestamptz < now()-interval '10 minutes'
         or (v_snapshot->>'verifiedAt')::timestamptz > now()+interval '1 minute' then
        raise exception 'Invalid billing snapshot';
      end if;
      update public.admin_architecture_subscriptions set billing_snapshot=v_snapshot where provider=v_provider;
      get diagnostics v_count=row_count;
      if v_count<>1 then raise exception 'Missing architecture provider'; end if;
    end if;
  end loop;
  update public.admin_architecture_billing_runs set finished_at=now(),results=p_results,
    previous_snapshots=v_previous,
    status=case when p_results->'github'->>'status'='synced' and p_results->'railway'->>'status'='synced'
      then 'completed' else 'partial' end
    where id=p_run_id;
  return true;
end;
$fn$;
revoke all on function public.finish_admin_architecture_billing_run(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_admin_architecture_billing_run(uuid,jsonb) to service_role;
comment on table public.admin_architecture_billing_runs is 'One automatic GitHub/Railway billing attempt per Taipei calendar day. Private status and rollback snapshots. Supabase/Cloudflare coverage remains pending.';
