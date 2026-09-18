revoke execute on function public.matrix_custom_status_reset(text, text) from public, anon;
grant execute on function public.matrix_custom_status_reset(text, text) to authenticated, service_role;

revoke execute on function public.member_notification_settings_get() from public, anon;
grant execute on function public.member_notification_settings_get() to authenticated, service_role;

revoke execute on function public.member_notification_settings_save(jsonb) from public, anon;
grant execute on function public.member_notification_settings_save(jsonb) to authenticated, service_role;
