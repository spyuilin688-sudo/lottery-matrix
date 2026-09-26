-- Service-only App administration. The authenticated admin actor is checked again in SQL.
create function private.require_app_admin(p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.admin_accounts where id=p_actor_id and status='啟用'
    and role='超級管理員' and lower(btrim(account))='spyuilin688@gmail.com' for share;
  if not found then raise exception using errcode='42501',message='APP_ADMIN_FORBIDDEN'; end if;
end;
$$;
revoke all on function private.require_app_admin(uuid) from public,anon,authenticated;
create table private.app_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  member_id uuid not null references public.app_members(id) on delete cascade,
  before_status text not null, after_status text not null,
  entitlement_revision integer not null,
  created_at timestamptz not null default now()
);
alter table private.app_admin_audit enable row level security;
revoke all on private.app_admin_audit from public,anon,authenticated;
grant select on private.app_admin_audit to service_role;

create function public.app_admin_list(p_actor_id uuid,p_view text,p_page integer default 1,p_page_size integer default 25,p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_total bigint; v_items jsonb;
begin
  perform private.require_app_admin(p_actor_id);
  if p_view not in ('users','subscriptions') or p_page is null or p_page < 1 or p_page > 1000000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 or length(coalesce(p_query,'')) > 200
  then raise exception using errcode='22023',message='APP_ADMIN_INVALID_QUERY'; end if;
  select count(*) into v_total from public.app_members m
    where coalesce(p_query,'')='' or position(lower(p_query) in lower(coalesce(m.display_name,'')||' '||m.id::text))>0;
  select coalesce(jsonb_agg(row_data order by registered_at desc,id),'[]') into v_items from (
    select m.id,m.registered_at,jsonb_build_object('id',m.id,'displayName',m.display_name,'status',m.status,
      'entitlementRevision',m.entitlement_revision,'registeredAt',m.registered_at,'entitlementSource',e.source,
      'subscription',case when s.id is null then null else jsonb_build_object('id',s.id,'status',s.status,'startsAt',s.starts_at,'expiresAt',s.expires_at) end) as row_data
    from public.app_members m left join public.app_entitlements e on e.member_id=m.id
    left join lateral (select * from public.app_subscriptions where member_id=m.id order by starts_at desc,id desc limit 1) s on true
    where coalesce(p_query,'')='' or position(lower(p_query) in lower(coalesce(m.display_name,'')||' '||m.id::text))>0
    order by m.registered_at desc,m.id limit p_page_size offset (p_page-1)*p_page_size
  ) rows;
  return jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_page_size);
end;
$$;
create function public.app_admin_set_status(p_actor_id uuid,p_member_id uuid,p_status text,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.app_members; v_revision integer;
begin
  perform private.require_app_admin(p_actor_id);
  if p_status is null or p_status not in ('active','disabled') or p_expected_revision is null or p_expected_revision<1
  then raise exception using errcode='22023',message='APP_ADMIN_INVALID_STATUS'; end if;
  select * into v_member from public.app_members where id=p_member_id for update;
  if not found then raise exception using errcode='P0001',message='APP_MEMBER_NOT_FOUND'; end if;
  if v_member.entitlement_revision<>p_expected_revision then raise exception using errcode='P0001',message='APP_REVISION_CONFLICT'; end if;
  update public.app_members set status=p_status,entitlement_revision=entitlement_revision+1 where id=p_member_id returning entitlement_revision into v_revision;
  insert into private.app_admin_audit(actor_id,member_id,before_status,after_status,entitlement_revision)
    values(p_actor_id,p_member_id,v_member.status,p_status,v_revision);
  return jsonb_build_object('id',p_member_id,'status',p_status,'entitlementRevision',v_revision);
end;
$$;
create function public.app_admin_revenue(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_count bigint; v_totals jsonb;
begin
  perform private.require_app_admin(p_actor_id);
  select count(*) into v_count from public.app_revenue_entries;
  if v_count>9007199254740991 or exists(select 1 from public.app_revenue_entries group by currency having abs(sum(gross_minor))>9007199254740991)
  then raise exception using errcode='22003',message='APP_REVENUE_OVERFLOW'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'grossMinor',gross) order by currency),'[]') into v_totals
    from (select currency,sum(gross_minor) as gross from public.app_revenue_entries group by currency) amounts;
  return jsonb_build_object('transactionCount',v_count,'totalsByCurrency',v_totals);
end;
$$;
revoke all on function public.app_admin_list(uuid,text,integer,integer,text),public.app_admin_set_status(uuid,uuid,text,integer),public.app_admin_revenue(uuid) from public,anon,authenticated;
grant execute on function public.app_admin_list(uuid,text,integer,integer,text),public.app_admin_set_status(uuid,uuid,text,integer),public.app_admin_revenue(uuid) to service_role;
