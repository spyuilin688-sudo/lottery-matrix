drop function if exists public.matrix_permission_settings_update(jsonb);
drop table if exists private.matrix_permission_credentials;
notify pgrst, 'reload schema';
