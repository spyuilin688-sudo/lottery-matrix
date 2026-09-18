-- Superadministrator devices are separate from member push subscriptions.
create table public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_accounts(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 4096),
  p256dh text not null,
  auth_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_push_subscriptions_admin_idx on public.admin_push_subscriptions(admin_id);
create table public.admin_transfer_push_jobs (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfer_requests(id) on delete cascade,
  subscription_id uuid not null references public.admin_push_subscriptions(id) on delete cascade,
  admin_id uuid not null references public.admin_accounts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (transfer_id,subscription_id)
);
create index admin_transfer_push_jobs_due_idx on public.admin_transfer_push_jobs(next_attempt_at) where status in ('pending','sending');
create index admin_transfer_push_jobs_subscription_idx on public.admin_transfer_push_jobs(subscription_id);
create index admin_transfer_push_jobs_admin_idx on public.admin_transfer_push_jobs(admin_id);
alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_transfer_push_jobs enable row level security;
revoke all on public.admin_push_subscriptions,public.admin_transfer_push_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.admin_push_subscriptions,public.admin_transfer_push_jobs to service_role;

create function private.admin_transfer_push_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status = 'pending' then
    insert into public.admin_transfer_push_jobs(transfer_id,subscription_id,admin_id)
    select new.id,s.id,s.admin_id from public.admin_push_subscriptions s
    join public.admin_accounts a on a.id=s.admin_id
    where s.enabled and a.status='啟用' and a.role='超級管理員'
    on conflict (transfer_id,subscription_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.admin_transfer_push_enqueue() from public,anon,authenticated,service_role;
create trigger admin_transfer_push_on_insert after insert on public.transfer_requests
for each row execute function private.admin_transfer_push_enqueue();

-- SECURITY INVOKER: only the backend service role can claim or inspect work.
create function public.admin_transfer_push_eligible(p_id uuid,p_lease_token uuid)
returns boolean language sql security invoker set search_path='' as $$
  select exists (
    select 1 from public.admin_transfer_push_jobs j
    join public.admin_push_subscriptions s on s.id=j.subscription_id and s.admin_id=j.admin_id
    join public.admin_accounts a on a.id=j.admin_id
    join public.transfer_requests t on t.id=j.transfer_id
    where j.id=p_id and j.lease_token=p_lease_token and j.status='sending'
      and j.lease_until>now() and s.enabled and a.role='超級管理員' and a.status='啟用' and t.status='pending'
      -- A re-enrolled/shared-device subscription must not receive old queued work.
      and s.updated_at<=j.created_at
  );
$$;
create function public.admin_transfer_push_claim()
returns table(id uuid,lease_token uuid,subscription_id uuid,admin_id uuid,transfer_id uuid,endpoint text,p256dh text,auth_key text)
language plpgsql security invoker set search_path='' as $$
begin
  update public.admin_transfer_push_jobs j set status='failed',finished_at=now()
  where j.status in ('pending','sending') and j.attempt_count>=5
    and (j.status='pending' or j.lease_until<=now());
  return query
  with candidates as (
    select j.id from public.admin_transfer_push_jobs j
    where j.attempt_count<5 and (
      (j.status='pending' and j.next_attempt_at<=now()) or
      (j.status='sending' and j.lease_until<=now()))
    order by j.next_attempt_at,j.id for update skip locked limit 10
  ), claimed as (
    update public.admin_transfer_push_jobs j
    set status='sending',attempt_count=j.attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from candidates c where j.id=c.id returning j.*
  )
  select j.id,j.lease_token,j.subscription_id,j.admin_id,j.transfer_id,s.endpoint,s.p256dh,s.auth_key
  from claimed j join public.admin_push_subscriptions s on s.id=j.subscription_id;
end;
$$;
create function public.admin_transfer_push_finish(p_id uuid,p_lease_token uuid,p_outcome text,p_disable boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_job public.admin_transfer_push_jobs%rowtype;
begin
  if p_outcome not in ('sent','retry','failed','skipped') then raise exception 'INVALID_OUTCOME'; end if;
  select * into v_job from public.admin_transfer_push_jobs j
  where j.id=p_id and j.lease_token=p_lease_token and j.status='sending' and j.lease_until>now() for update;
  if not found then return false; end if;
  if p_disable then
    update public.admin_push_subscriptions s set enabled=false,updated_at=now()
    where s.id=v_job.subscription_id and s.admin_id=v_job.admin_id and s.updated_at<=v_job.created_at;
  end if;
  update public.admin_transfer_push_jobs j set
    status=case when p_outcome='retry' and j.attempt_count<5 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end,
    next_attempt_at=now()+make_interval(mins=>power(2,j.attempt_count-1)::integer),
    finished_at=case when p_outcome='retry' and j.attempt_count<5 then null else now() end,
    lease_token=null,lease_until=null
  where j.id=p_id;
  return true;
end;
$$;
revoke all on function public.admin_transfer_push_claim(),public.admin_transfer_push_eligible(uuid,uuid),public.admin_transfer_push_finish(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_transfer_push_claim(),public.admin_transfer_push_eligible(uuid,uuid),public.admin_transfer_push_finish(uuid,uuid,text,boolean) to service_role;

create function private.admin_transfer_push_tick() returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text; v_token text; v_request bigint;
begin
  if not exists(select 1 from public.admin_transfer_push_jobs j where
    (j.status='pending' and j.next_attempt_at<=now()) or (j.status='sending' and j.lease_until<=now())) then return null; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_notification_dispatch_token' limit 1;
  if nullif(trim(v_url),'') is null or nullif(trim(v_token),'') is null then raise exception 'ADMIN_PUSH_CONFIG_MISSING'; end if;
  select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/admin-transfer-push',
    headers:=jsonb_build_object('Content-Type','application/json','x-matrix-dispatch-token',v_token),
    body:='{}'::jsonb,timeout_milliseconds:=30000) into v_request;
  return v_request;
end;
$$;
revoke all on function private.admin_transfer_push_tick() from public,anon,authenticated,service_role;
select cron.schedule('admin-transfer-push-minute','* * * * *','select private.admin_transfer_push_tick();');
