-- Preserve verified historical payments separately from the latest API invoice.
alter table public.admin_architecture_billing_runs
  drop constraint admin_architecture_billing_runs_status_check;
alter table public.admin_architecture_billing_runs
  add constraint admin_architecture_billing_runs_status_check
  check (status in ('running','completed','partial','failed'));

create or replace function public.fail_admin_architecture_billing_run(p_run_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $fn$
begin
  update public.admin_architecture_billing_runs
    set status='failed',finished_at=now(),results=jsonb_build_object('error','SYNC_INTERRUPTED')
    where id=p_run_id and status='running';
  return found;
end;
$fn$;
revoke all on function public.fail_admin_architecture_billing_run(uuid) from public,anon,authenticated;
grant execute on function public.fail_admin_architecture_billing_run(uuid) to service_role;

create or replace function public.claim_admin_architecture_billing_run()
returns uuid language plpgsql security invoker set search_path='' as $fn$
declare v_id uuid;
begin
  -- No extra poller or retry: expire abandoned work on the next invocation.
  update public.admin_architecture_billing_runs
    set status='failed',finished_at=now(),results=jsonb_build_object('error','SYNC_INTERRUPTED')
    where status='running' and started_at<=now()-interval '10 minutes';
  insert into public.admin_architecture_billing_runs(run_day)
    values ((now() at time zone 'Asia/Taipei')::date)
    on conflict(run_day) do nothing returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.claim_admin_architecture_billing_run() from public,anon,authenticated;
grant execute on function public.claim_admin_architecture_billing_run() to service_role;

create or replace function public.finish_admin_architecture_billing_run(p_run_id uuid,p_results jsonb)
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
      then 'completed'
      when p_results->'github'->>'status'='synced' or p_results->'railway'->>'status'='synced' then 'partial'
      else 'failed' end
    where id=p_run_id;
  return true;
end;
$fn$;
revoke all on function public.finish_admin_architecture_billing_run(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_admin_architecture_billing_run(uuid,jsonb) to service_role;

-- Recover only already-recorded payment facts. Never infer a new invoice's payment date.
with prior as (
  select previous_snapshots->'railway' as snapshot
  from public.admin_architecture_billing_runs
  where previous_snapshots->'railway'->>'latestPaymentDate' is not null
    and previous_snapshots->'railway'->>'latestInvoiceAmount' is not null
    and previous_snapshots->'railway'->>'verifiedAt' is not null
  order by started_at desc limit 1
), recovered as (
  select jsonb_build_object('paymentDate',snapshot->>'latestPaymentDate',
    'amount',snapshot->>'latestInvoiceAmount','verifiedAt',snapshot->>'verifiedAt',
    'source',snapshot->>'source') as payment from prior
)
update public.admin_architecture_subscriptions s
set billing_snapshot=s.billing_snapshot || jsonb_build_object(
  'manualPayment',r.payment,
  'source','Railway API（全工作區含 Agent）；用量／預估未折抵；待出帳可能延遲；API 未提供付款日期'
    || '；人工核對付款：' || (r.payment->>'paymentDate') || ' ' || (r.payment->>'amount')
    || '（核對：' || to_char((r.payment->>'verifiedAt')::timestamptz at time zone 'UTC','YYYY-MM-DD') || '；非本期付款日期）')
from recovered r
where s.provider='railway' and s.billing_snapshot is not null
  and s.billing_snapshot->>'latestPaymentDate' is null
  and (s.billing_snapshot->'manualPayment' is null or s.billing_snapshot->'manualPayment'='null'::jsonb);

update public.admin_architecture_billing_runs
set status='failed',finished_at=now(),results=jsonb_build_object('error','SYNC_INTERRUPTED')
where status='running' and started_at<=now()-interval '10 minutes';
