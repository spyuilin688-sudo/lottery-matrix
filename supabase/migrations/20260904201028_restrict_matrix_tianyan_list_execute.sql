revoke execute on function public.matrix_tianyan_list(jsonb) from public, anon;
grant execute on function public.matrix_tianyan_list(jsonb) to authenticated, service_role;
