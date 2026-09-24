-- Serialize a member's config mutations and result publication, including inserts.
create or replace function private.matrix_custom_status_config_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
 if tg_op <> 'INSERT' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.member_id::text||':'||old.lottery, 0));
 end if;
 if tg_op <> 'DELETE' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.member_id::text||':'||new.lottery, 0));
   return new;
 end if;
 return old;
end;
$$;
drop trigger if exists matrix_custom_status_config_lock on public.matrix_custom_status_configs;
create trigger matrix_custom_status_config_lock before insert or update or delete
 on public.matrix_custom_status_configs for each row execute function private.matrix_custom_status_config_lock();

create or replace function public.matrix_custom_status_publish(p_result jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
 v_member uuid := (p_result->>'member_id')::uuid;
 v_lottery text := p_result->>'lottery';
 v_period text := p_result->>'draw_period';
 v_latest text;
 v_version text;
 v_configs jsonb;
begin
 -- Same lock order for every publication. The short shared locks fence a draw
 -- insertion/promotion while the latest-period/version check and upsert commit.
 lock table public.lottery_draws in share mode;
 lock table private.matrix_analysis_active_versions in share mode;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_member::text||':'||v_lottery, 0));
 select period into v_latest from public.lottery_draws where lottery=v_lottery
 order by draw_date desc nulls last,period desc limit 1;
 select analysis_version into v_version from private.matrix_analysis_active_versions
 where lottery=v_lottery and draw_period=v_period and number_order='sorted';
 select pg_catalog.jsonb_agg(private.matrix_custom_status_normalize_config(config,true) order by status collate "C")
 into v_configs from public.matrix_custom_status_configs where member_id=v_member and lottery=v_lottery;
 if v_latest is distinct from v_period or v_version is null
   or v_version is distinct from p_result->>'analysis_version'
   or v_configs is null or not private.matrix_custom_status_key_matches(p_result->>'config_key',v_configs)
 then return false; end if;
 insert into public.matrix_custom_status_results(member_id,lottery,analysis_version,draw_period,config_key,standard_payload,composite_payload,updated_at)
 values(v_member,v_lottery,v_version,v_period,p_result->>'config_key',p_result->'standard_payload',p_result->'composite_payload',now())
 on conflict(member_id,lottery) do update set analysis_version=excluded.analysis_version,draw_period=excluded.draw_period,
 config_key=excluded.config_key,standard_payload=excluded.standard_payload,composite_payload=excluded.composite_payload,updated_at=excluded.updated_at;
 return true;
end;
$$;
revoke all on function private.matrix_custom_status_config_lock() from public,anon,authenticated;
create or replace function public.matrix_custom_status_clear_if_unconfigured(p_member uuid,p_lottery text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_member::text||':'||p_lottery,0));
 if exists(select 1 from public.matrix_custom_status_configs where member_id=p_member and lottery=p_lottery)
 then return false; end if;
 delete from public.matrix_custom_status_results where member_id=p_member and lottery=p_lottery;
 return true;
end;
$$;
revoke all on function public.matrix_custom_status_clear_if_unconfigured(uuid,text) from public,anon,authenticated;
grant execute on function public.matrix_custom_status_clear_if_unconfigured(uuid,text) to service_role;
revoke all on function public.matrix_custom_status_publish(jsonb) from public,anon,authenticated;
grant execute on function public.matrix_custom_status_publish(jsonb) to service_role;
notify pgrst,'reload schema';