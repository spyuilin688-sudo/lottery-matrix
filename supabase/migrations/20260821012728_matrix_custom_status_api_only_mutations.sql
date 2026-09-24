drop policy if exists "Members can insert own Matrix custom status configs"
  on public.matrix_custom_status_configs;

drop policy if exists "Members can update own Matrix custom status configs"
  on public.matrix_custom_status_configs;

drop policy if exists "Members can delete own Matrix custom status configs"
  on public.matrix_custom_status_configs;

revoke insert, update, delete
  on table public.matrix_custom_status_configs
  from authenticated;
