begin;

create or replace function public.ecpay_quota_query_backoff(p_merchant_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,10}$' then
    raise exception 'INVALID_ORDER';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ecpay-quota:' || p_merchant_id, 0)
  );
  insert into public.ecpay_quota_reconciliation values(
    p_merchant_id, pg_catalog.now() + interval '30 minutes'
  )
  on conflict (merchant_id) do update set retry_after = greatest(
    public.ecpay_quota_reconciliation.retry_after, excluded.retry_after
  );
end;
$$;

revoke all on function public.ecpay_quota_query_backoff(text) from public, anon, authenticated;
grant execute on function public.ecpay_quota_query_backoff(text) to service_role;

commit;
