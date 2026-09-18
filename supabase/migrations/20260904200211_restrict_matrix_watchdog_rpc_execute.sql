revoke all on function public.claim_matrix_watchdog_lease(text, text, integer) from public, anon, authenticated;
revoke all on function public.release_matrix_watchdog_lease(text, text) from public, anon, authenticated;
revoke all on function public.begin_matrix_watchdog_recovery(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.renew_matrix_watchdog_recovery(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.finish_matrix_watchdog_recovery(text, text, text) from public, anon, authenticated;

grant execute on function public.claim_matrix_watchdog_lease(text, text, integer) to service_role;
grant execute on function public.release_matrix_watchdog_lease(text, text) to service_role;
grant execute on function public.begin_matrix_watchdog_recovery(text, text, text, integer) to service_role;
grant execute on function public.renew_matrix_watchdog_recovery(text, text, text, integer) to service_role;
grant execute on function public.finish_matrix_watchdog_recovery(text, text, text) to service_role;
