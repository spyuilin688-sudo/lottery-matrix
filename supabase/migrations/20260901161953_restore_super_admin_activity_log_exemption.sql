begin;

drop trigger if exists skip_super_admin_audit_logs on public.audit_logs;
create trigger skip_super_admin_audit_logs
before insert on public.audit_logs
for each row execute function public.skip_super_admin_activity_logs();

notify pgrst, 'reload schema';

commit;
