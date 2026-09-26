-- Match content filtering to the audit response: a public subscription action
-- remains searchable even when the member previously redeemed a private code.
create or replace function public.admin_visible_audit_content(public.audit_logs)
returns text language sql stable security invoker set search_path = '' as $$
  select case
    when $1.target_table = 'members'
      and $1.content ~* '終生|終身|永久|lifetime'
      and exists (
        select 1 from public.private_activation_redemption_history as snapshot
        where snapshot.member_id = case
          when $1.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then $1.target_id::uuid else null::uuid end
      ) then '會員資料異動'
    else $1.content
  end;
$$;
revoke all on function public.admin_visible_audit_content(public.audit_logs) from public, anon, authenticated;
grant execute on function public.admin_visible_audit_content(public.audit_logs) to service_role;

notify pgrst, 'reload schema';
