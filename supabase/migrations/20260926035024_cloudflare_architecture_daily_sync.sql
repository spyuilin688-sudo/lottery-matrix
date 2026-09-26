-- Include Cloudflare in the existing daily atomic completion; no new schedule.
create or replace function public.finish_admin_architecture_billing_run(p_run_id uuid,p_results jsonb)
returns boolean language plpgsql security invoker set search_path='' as $fn$
declare v_provider text; v_item jsonb; v_snapshot jsonb; v_previous jsonb; v_count integer;
begin
  perform 1 from public.admin_architecture_billing_runs
    where id=p_run_id and status='running' and started_at>now()-interval '10 minutes' for update;
  if not found then return false; end if;
  if jsonb_typeof(p_results) is distinct from 'object' then raise exception 'Invalid billing results'; end if;
  select jsonb_object_agg(provider,billing_snapshot) into v_previous
    from public.admin_architecture_subscriptions where provider in ('github','railway','cloudflare');
  foreach v_provider in array array['github','railway','cloudflare'] loop
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
    status=case when p_results->'github'->>'status'='synced' and p_results->'railway'->>'status'='synced' and p_results->'cloudflare'->>'status'='synced'
      then 'completed'
      when p_results->'github'->>'status'='synced' or p_results->'railway'->>'status'='synced' or p_results->'cloudflare'->>'status'='synced' then 'partial'
      else 'failed' end
    where id=p_run_id;
  return true;
end;
$fn$;
revoke all on function public.finish_admin_architecture_billing_run(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_admin_architecture_billing_run(uuid,jsonb) to service_role;

