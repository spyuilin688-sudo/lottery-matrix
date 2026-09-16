begin;

create or replace function public.notification_event_exists_server(p_event_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.notification_events as event
    where event.event_key = nullif(pg_catalog.btrim(p_event_key), '')
  );
$$;

revoke all on function public.notification_event_exists_server(text)
  from public, anon, authenticated;
grant execute on function public.notification_event_exists_server(text)
  to service_role;

commit;
