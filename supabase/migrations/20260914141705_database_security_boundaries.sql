-- Browser clients use scoped member/Matrix RPCs; these tables are backend-only.
-- In particular, RLS does not cover TRUNCATE or REFERENCES privileges.
set local lock_timeout = '3s';

revoke all on table
  public.activation_code_batches,
  public.activation_codes,
  public.admin_accounts,
  public.admin_login_records,
  public.audit_logs,
  public.payments,
  public.plans,
  public.transfer_requests
from public, anon, authenticated;

-- Both tables already deny direct client/service access and are reached through
-- postgres-owned SECURITY DEFINER functions. Keep default-deny row access.
alter table private.admin_watchdog_runtime enable row level security;
alter table private.line_pwa_handoff_diagnostics enable row level security;

-- Add a structural key without reading, replacing, or rotating the secret.
-- Abort on unexpected cardinality rather than choosing or deleting a row.
do $migration$
begin
  if (select count(*) from private.security_identity_secret) <> 1 then
    raise exception 'SECURITY_IDENTITY_SECRET_SINGLETON_REQUIRED';
  end if;
end
$migration$;

alter table private.security_identity_secret
  add column singleton boolean not null default true,
  add constraint security_identity_secret_pkey primary key (singleton),
  add constraint security_identity_secret_singleton_check check (singleton);
