begin;

set local lock_timeout = '5s';

-- The calendar sync records clock_timestamp() inside its transaction. A trigger
-- using now() sees the earlier transaction start, so a fresh calendar may be
-- treated as unavailable and leave an unnecessary recovery/primary check.
create or replace function private.matrix_recovery_calendar_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
 perform private.matrix_recovery_refresh_calendar('evening', v_now);
 perform private.matrix_recovery_refresh_calendar('fantasy5', v_now);
 return null;
end $$;

create or replace function private.matrix_primary_calendar_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
 perform private.matrix_primary_refresh('evening', v_now);
 perform private.matrix_primary_refresh('fantasy5', v_now);
 return null;
end $$;

revoke all on function private.matrix_recovery_calendar_event(),
 private.matrix_primary_calendar_event()
 from public, anon, authenticated, service_role;

commit;
