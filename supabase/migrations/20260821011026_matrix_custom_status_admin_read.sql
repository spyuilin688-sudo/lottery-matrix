create policy "Admins can read Matrix custom status configs"
  on public.matrix_custom_status_configs
  for select
  to authenticated
  using ((select public.is_admin()));
