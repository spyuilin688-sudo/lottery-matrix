begin;

alter table public.members
  drop constraint if exists members_lifetime_expiry_check;

alter table public.members
  add constraint members_lifetime_expiry_check check (
    (is_lifetime and plan_expires_at is null)
    or (not is_lifetime)
  );

commit;
