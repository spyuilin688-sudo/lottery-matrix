-- Run transactionally: no test account, request or notification survives rollback.
begin;
do $$
declare
  a uuid; ordinary uuid; disabled uuid; s uuid; t uuid; member uuid; plan uuid;
  j record; n integer;
begin
  if has_table_privilege('anon','public.admin_push_subscriptions','SELECT')
    or has_table_privilege('authenticated','public.admin_transfer_push_jobs','INSERT')
    or has_function_privilege('authenticated','public.admin_transfer_push_claim()','EXECUTE') then raise exception 'PUBLIC_ACCESS'; end if;
  if not (select relrowsecurity from pg_class where oid='public.admin_push_subscriptions'::regclass) then raise exception 'RLS_MISSING'; end if;
  select m.id into member from public.members m where not exists(select 1 from public.transfer_requests r where r.member_id=m.id and r.status='pending') limit 1;
  select p.id into plan from public.plans p limit 1;
  if member is null or plan is null then raise exception 'READ_ONLY_FIXTURE_PREREQUISITE_MISSING'; end if;
  insert into public.admin_accounts(account,name,role) values ('push-test-'||gen_random_uuid(),'Rollback push test','超級管理員') returning id into a;
  insert into public.admin_accounts(account,name,role) values ('push-test-'||gen_random_uuid(),'Rollback push test','查看人員') returning id into ordinary;
  insert into public.admin_accounts(account,name,role,status) values ('push-test-'||gen_random_uuid(),'Rollback push test','超級管理員','停用') returning id into disabled;
  insert into public.admin_push_subscriptions(admin_id,endpoint,p256dh,auth_key) values (a,'https://fcm.googleapis.com/rollback-'||gen_random_uuid(),'test','test') returning id into s;
  insert into public.admin_push_subscriptions(admin_id,endpoint,p256dh,auth_key) values
    (ordinary,'https://fcm.googleapis.com/rollback-'||gen_random_uuid(),'test','test'),
    (disabled,'https://fcm.googleapis.com/rollback-'||gen_random_uuid(),'test','test');
  insert into public.transfer_requests(member_id,plan_id,amount,transferred_at,account_last_five)
    values (member,plan,1,now(),'00000') returning id into t;
  select count(*) into n from public.admin_transfer_push_jobs where transfer_id=t;
  if n<>1 then raise exception 'SUPERADMIN_FANOUT_FAILED %',n; end if;
  select * into j from public.admin_transfer_push_claim() where transfer_id=t;
  if j.id is null or not public.admin_transfer_push_eligible(j.id,j.lease_token) then raise exception 'CLAIM_FAILED'; end if;
  if exists(select 1 from public.admin_transfer_push_claim() where transfer_id=t) then raise exception 'DOUBLE_CLAIM'; end if;
  if public.admin_transfer_push_finish(j.id,gen_random_uuid(),'sent',false) then raise exception 'STALE_LEASE_ACCEPTED'; end if;
  update public.admin_accounts set role='查看人員' where id=a;
  if public.admin_transfer_push_eligible(j.id,j.lease_token) then raise exception 'DEMOTION_IGNORED'; end if;
  update public.admin_accounts set role='超級管理員' where id=a;
  update public.admin_push_subscriptions set enabled=false where id=s;
  if public.admin_transfer_push_eligible(j.id,j.lease_token) then raise exception 'DISABLE_IGNORED'; end if;
  update public.admin_push_subscriptions set enabled=true,updated_at=now()+interval '1 second' where id=s;
  if public.admin_transfer_push_eligible(j.id,j.lease_token) then raise exception 'REENROLLMENT_IGNORED'; end if;
  update public.admin_push_subscriptions set updated_at=now() where id=s;
  update public.transfer_requests set status='confirmed' where id=t;
  if public.admin_transfer_push_eligible(j.id,j.lease_token) then raise exception 'REVIEWED_REQUEST_IGNORED'; end if;
  update public.transfer_requests set status='pending' where id=t;
  if not public.admin_transfer_push_finish(j.id,j.lease_token,'retry',false) then raise exception 'RETRY_FAILED'; end if;
  if exists(select 1 from public.admin_transfer_push_claim() where transfer_id=t) then raise exception 'BACKOFF_IGNORED'; end if;
  update public.admin_transfer_push_jobs set next_attempt_at=now()-interval '1 minute',attempt_count=4 where id=j.id;
  select * into j from public.admin_transfer_push_claim() where transfer_id=t;
  perform public.admin_transfer_push_finish(j.id,j.lease_token,'retry',true);
  if (select status from public.admin_transfer_push_jobs where id=j.id)<>'failed' then raise exception 'RETRY_LIMIT_IGNORED'; end if;
  if (select enabled from public.admin_push_subscriptions where id=s) then raise exception 'EXPIRED_ENDPOINT_NOT_DISABLED'; end if;
end;
$$;
rollback;
