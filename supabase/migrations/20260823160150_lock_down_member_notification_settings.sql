revoke all on table public.notification_settings from public, anon, authenticated;

grant select, insert, update, delete
  on table public.notification_settings
  to service_role;
