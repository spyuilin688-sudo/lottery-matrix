begin;

-- The provider response is MAC-checked by the Edge Function. A successful
-- payment must write its quota evidence and entitlement in one transaction.
create function public.ecpay_paid_reconcile(
  p_merchant_id text, p_merchant_trade_no text, p_amount integer,
  p_state text, p_payment_type text, p_provider_status text,
  p_occurred_at timestamptz, p_trade_no text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_provider_status is distinct from '1' then
    raise exception 'INVALID_PAID_EVIDENCE';
  end if;
  perform public.ecpay_quota_record(
    p_merchant_id,p_merchant_trade_no,p_amount,p_state,p_payment_type,
    p_provider_status,p_occurred_at,p_trade_no
  );
  return public.ecpay_payment_confirm(p_merchant_trade_no,p_merchant_id,p_trade_no,p_amount);
end;
$$;
revoke all on function public.ecpay_paid_reconcile(text,text,integer,text,text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.ecpay_paid_reconcile(text,text,integer,text,text,text,timestamptz,text)
  to service_role;

-- Preserve the checkout's quota reconciliation while including pending orders
-- whose quota was occupied by an unpaid ATM/CVS number or a partial callback.
create or replace function public.ecpay_quota_reconcile_claim(p_merchant_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_after timestamptz; v_orders jsonb;
begin
  if p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,10}$' then raise exception 'INVALID_ORDER'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ecpay-quota:' || p_merchant_id,0));
  select retry_after into v_after from public.ecpay_quota_reconciliation where merchant_id=p_merchant_id;
  if v_after > pg_catalog.now() then return '[]'::jsonb; end if;
  insert into public.ecpay_quota_reconciliation values(p_merchant_id,pg_catalog.now()+interval '2 minutes')
  on conflict (merchant_id) do update set retry_after=excluded.retry_after;
  with picked as (
    select id from public.ecpay_orders
    where merchant_id=p_merchant_id
      and (quota_state='reserved' or (quota_state='occupied' and status='pending'))
      and created_at <= pg_catalog.now()-interval '10 minutes'
      and (quota_check_after is null or quota_check_after <= pg_catalog.now())
    order by case when status='pending' then 0 else 1 end,
      quota_check_after nulls first,created_at,id limit 5
  ), claimed as (
    update public.ecpay_orders o set quota_check_after=pg_catalog.now()+interval '10 minutes'
    from picked where o.id=picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'merchantId',merchant_id,'merchantTradeNo',merchant_trade_no,'amount',amount
  )),'[]'::jsonb) into v_orders from claimed;
  return v_orders;
end;
$$;

commit;

-- Scheduled invocation; skip idle minutes and honour the same merchant lease
-- and rate-limit backoff used by the checkout reconciliation path.
begin;
create function private.ecpay_recovery_http_tick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_token text; v_request_id bigint;
begin
  if not exists (
    select 1 from public.ecpay_orders o
    left join public.ecpay_quota_reconciliation r on r.merchant_id=o.merchant_id
    where o.status='pending' and o.quota_state in ('reserved','occupied')
      and o.created_at <= pg_catalog.now()-interval '10 minutes'
      and (o.quota_check_after is null or o.quota_check_after <= pg_catalog.now())
      and (r.retry_after is null or r.retry_after <= pg_catalog.now())
  ) then return null; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_notification_dispatch_token' limit 1;
  if nullif(pg_catalog.btrim(v_url),'') is null
     or nullif(pg_catalog.btrim(v_token),'') is null then
    raise exception 'ECPAY_RECOVERY_VAULT_MISSING';
  end if;
  select net.http_post(
    url:=pg_catalog.rtrim(v_url,'/')||'/functions/v1/ecpay-recover',
    headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','x-matrix-dispatch-token',v_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=30000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.ecpay_recovery_http_tick() from public, anon, authenticated, service_role;
select cron.schedule('matrix-ecpay-paid-recovery','*/5 * * * *',
  'select private.ecpay_recovery_http_tick();');
commit;
