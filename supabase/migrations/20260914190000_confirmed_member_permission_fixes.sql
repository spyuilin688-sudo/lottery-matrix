-- Narrow the direct table grant to the only operation exposed through RLS.
revoke insert, update, delete, truncate, references, trigger
  on table public.member_push_subscriptions from authenticated;
grant select on table public.member_push_subscriptions to authenticated;

-- Reset mutates a member's preserved custom configuration, so it requires the
-- same entitlement as save instead of merely requiring an active account.
create or replace function public.matrix_custom_status_reset(p_lottery text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitlements jsonb;
begin
  v_entitlements := private.matrix_result_entitlements();
  if (v_entitlements->>'canCustomizeStatus')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return public.matrix_custom_status_reset_20260829_impl(p_lottery, p_status);
end;
$$;

revoke all on function public.matrix_custom_status_reset(text, text) from public, anon;
grant execute on function public.matrix_custom_status_reset(text, text) to authenticated, service_role;
