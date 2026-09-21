create or replace function public.matrix_status_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  return private.matrix_result_entitlements();
end;
$function$;

revoke all on function public.matrix_status_entitlements() from public;
grant execute on function public.matrix_status_entitlements() to anon, authenticated;
